const { execFile, spawn } = require('node:child_process')
const { copyFile, mkdir, readdir, rm } = require('node:fs/promises')
const { existsSync } = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const { promisify } = require('node:util')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const execFileAsync = promisify(execFile)
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])
const pollIntervalMs = Number(process.env.BATCH_WORKER_POLL_MS || 3000)
const speciesNetBatchSize = Number(process.env.SPECIESNET_BATCH_SIZE || 8)
const batchTimeoutMs = Number(process.env.SPECIESNET_BATCH_TIMEOUT_MS || 0)
const runOnce = process.argv.includes('--once')
const stepWarnMs = Number(process.env.BATCH_WORKER_STEP_WARN_MS || 20000)

let cachedHasCaptureColumns = null

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function runtimeStats(step) {
  const memory = process.memoryUsage()
  const cpu = step?.cpuStart ? process.cpuUsage(step.cpuStart) : process.cpuUsage()
  return `mem rss=${formatBytes(memory.rss)} heap=${formatBytes(memory.heapUsed)} cpu user=${(cpu.user / 1000).toFixed(0)}ms sys=${(cpu.system / 1000).toFixed(0)}ms`
}

function logException(prefix, error) {
  console.error(`${prefix}:`, error instanceof Error ? error.stack || error.message : error)
}

function startStep(number, label, details = '') {
  const step = {
    number,
    label,
    start: performance.now(),
    cpuStart: process.cpuUsage()
  }
  const suffix = details ? ` ${details}` : ''
  console.log(`[${number}] ${label}${suffix} | ${runtimeStats(step)}`)
  step.timer = setInterval(() => {
    const elapsed = ((performance.now() - step.start) / 1000).toFixed(1)
    console.warn(`El proceso lleva ${elapsed} segundos detenido en ${label} | ${runtimeStats(step)}`)
  }, stepWarnMs)
  step.timer.unref?.()
  return step
}

function finishStep(step, details = '') {
  if (step.timer) clearInterval(step.timer)
  const elapsed = ((performance.now() - step.start) / 1000).toFixed(2)
  const suffix = details ? ` ${details}` : ''
  console.log(`[${step.number}] ${step.label} terminado en ${elapsed}s${suffix} | ${runtimeStats(step)}`)
}

function failStep(step, error) {
  if (step.timer) clearInterval(step.timer)
  const elapsed = ((performance.now() - step.start) / 1000).toFixed(2)
  logException(`[${step.number}] ${step.label} fallo despues de ${elapsed}s`, error)
}

async function withStep(number, label, action, details = '') {
  const step = startStep(number, label, details)
  try {
    const result = await action()
    finishStep(step)
    return result
  } catch (error) {
    failStep(step, error)
    throw error
  }
}

async function hasDetectionCaptureColumns() {
  if (cachedHasCaptureColumns !== null) return cachedHasCaptureColumns
  try {
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Detection'
        AND column_name IN ('capturedAt', 'captureDateSource')
    `
    cachedHasCaptureColumns = Number(rows[0]?.count ?? 0) === 2
  } catch (error) {
    logException('[batch-worker] No se pudo verificar columnas de captura', error)
    cachedHasCaptureColumns = false
  }
  return cachedHasCaptureColumns
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase()
}

function normalizeSpecies(species) {
  return species
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function calculatePriority(species, confidence) {
  const threatenedSpecies = new Set(['jaguar', 'leopard', 'tapir amazonico', 'puma', 'ocelot', 'oso de anteojos', 'pecari'])
  const normalizedSpecies = normalizeSpecies(species)

  if (normalizedSpecies === 'sin deteccion' || confidence <= 0) {
    return 'Revision manual'
  }

  if (threatenedSpecies.has(normalizedSpecies) || confidence > 95) {
    return 'Alta prioridad'
  }

  return 'Normal'
}

function toPublicPath(diskPath) {
  const publicDir = path.join(process.cwd(), 'public')
  const relativePath = path.relative(publicDir, diskPath).split(path.sep).join('/')
  return `/${relativePath}`
}

function formatSeconds(start) {
  return ((performance.now() - start) / 1000).toFixed(2)
}

async function listImageFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        return listImageFiles(entryPath)
      }

      return imageExtensions.has(path.extname(entry.name).toLowerCase()) ? [entryPath] : []
    })
  )

  return files.flat()
}

async function extractZip(zipPath, extractDir) {
  await withStep(8, 'Preparando carpeta de extraccion', () => mkdir(extractDir, { recursive: true }), extractDir)
  const script = [
    'import sys, zipfile',
    'zip_path, out_dir = sys.argv[1], sys.argv[2]',
    'with zipfile.ZipFile(zip_path) as archive:',
    '    archive.extractall(out_dir)',
  ].join('\n')

  await withStep(9, 'Extrayendo ZIP', () => execFileAsync(process.env.PYTHON_BIN || 'python', ['-c', script, zipPath, extractDir], { timeout: 120000 }), zipPath)
}

async function prepareImagesForPrediction(imageFiles, preparedDir, jobId) {
  await withStep(10, 'Preparando carpeta temporal', async () => {
    await rm(preparedDir, { force: true, recursive: true }).catch(() => undefined)
    await mkdir(preparedDir, { recursive: true })
  }, preparedDir)

  const preparedImages = []
  let failedCopies = 0

  const step = startStep(11, 'Copiando imagenes a carpeta preparada', `total=${imageFiles.length}`)
  try {
    for (const [index, imagePath] of imageFiles.entries()) {
      try {
        if (index === 0 || (index + 1) % 100 === 0 || index + 1 === imageFiles.length) {
          console.log(`[11] Preparando imagen ${index + 1}/${imageFiles.length}: ${imagePath} | ${runtimeStats(step)}`)
        }
        const filename = `${String(index + 1).padStart(6, '0')}-${sanitizeFilename(path.basename(imagePath))}`
        const diskPath = path.join(preparedDir, filename)
        await copyFile(imagePath, diskPath)
        preparedImages.push({ diskPath, publicPath: toPublicPath(diskPath) })
      } catch (error) {
        failedCopies += 1
        logException(`[11] Error preparando imagen ${imagePath}`, error)
      }
    }
    finishStep(step, `preparadas=${preparedImages.length} fallidas=${failedCopies}`)
  } catch (error) {
    failStep(step, error)
    throw error
  }

  return { failedCopies, preparedImages }
}

async function createDetectionFromPrediction({ batchJobId, cameraId, location, owner, prediction, publicPath }) {
  const priority = calculatePriority(prediction.species, prediction.confidence)
  const coordinates = prediction.coordinates || null

  const start = performance.now()
  const hasCaptureColumns = await hasDetectionCaptureColumns()
  const captureData = hasCaptureColumns ? {
    capturedAt: prediction.capturedAt ? new Date(prediction.capturedAt) : null,
    captureDateSource: prediction.captureDateSource || null
  } : {}

  await prisma.detection.create({
    data: {
      batchJobId,
      cameraId,
      confidence: prediction.confidence,
      imagePath: publicPath,
      location,
      priority,
      species: prediction.species,
      ...captureData,
      userId: owner.id,
      x1: coordinates?.[0],
      y1: coordinates?.[1],
      x2: coordinates?.[2],
      y2: coordinates?.[3]
    },
    select: { id: true }
  })

  return performance.now() - start
}

async function claimNextJob() {
  const pendingJob = await withStep(1, 'Buscando lote pendiente', () => prisma.batchJob.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, zipName: true, createdAt: true },
    where: { status: 'Pendiente' }
  }))

  if (!pendingJob) {
    console.log('[1] No hay lotes pendientes')
    return null
  }

  console.log(`[1] Lote encontrado id=${pendingJob.id} zip=${pendingJob.zipName}`)

  const claimed = await withStep(2, 'Reclamando lote...', () => prisma.batchJob.updateMany({
    data: { error: null, status: 'Procesando' },
    where: { id: pendingJob.id, status: 'Pendiente' }
  }), `id=${pendingJob.id}`)

  if (claimed.count !== 1) {
    console.warn(`[3] Lote no reclamado id=${pendingJob.id}; otro proceso pudo tomarlo`)
    return null
  }

  console.log(`[3] Lote reclamado id=${pendingJob.id}`)

  return withStep(3, 'Cargando lote reclamado', () => prisma.batchJob.findUnique({
    include: {
      camera: { select: { id: true, name: true, zone: true } },
      user: { select: { id: true, name: true } }
    },
    where: { id: pendingJob.id }
  }), `id=${pendingJob.id}`)
}

async function runSpeciesNetBatch({ job, preparedImages, preparedDir, location }) {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const scriptPath = path.join(process.cwd(), 'python', 'predict_batch.py')
  const imageByDiskPath = new Map(preparedImages.map((image) => [path.resolve(image.diskPath), image]))
  const args = [scriptPath, preparedDir, '--batch-size', String(Number.isFinite(speciesNetBatchSize) && speciesNetBatchSize > 0 ? speciesNetBatchSize : 8)]
  const env = {
    ...process.env,
    SPECIESNET_COUNTRY: process.env.SPECIESNET_COUNTRY || 'ECU',
    PYTHONUNBUFFERED: '1'
  }
  const spawnStart = performance.now()
  let firstLineLogged = false
  let processedImages = 0
  let failedImages = Math.max(0, job.totalImages - preparedImages.length)
  let dbSaveMs = 0
  let lastImageAt = performance.now()
  let timeoutId = null
  let currentPythonStep = startStep(12, 'Iniciando predict_batch.py', `${pythonBin} ${args.join(' ')}`)

  const child = spawn(pythonBin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  finishStep(currentPythonStep, `pid=${child.pid || 'sin-pid'}`)
  currentPythonStep = startStep(13, 'Esperando salida inicial de predict_batch.py')

  if (batchTimeoutMs > 0) {
    timeoutId = setTimeout(() => {
      console.error(`[batch-worker] Timeout de lote ${job.id}; cerrando proceso Python`)
      child.kill('SIGTERM')
    }, batchTimeoutMs)
  }

  child.on('error', (error) => {
    logException(`[12] Error iniciando proceso Python para lote ${job.id}`, error)
  })

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim()
    if (text) {
      console.error(`[python stderr] ${text}`)
    }
  })

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    if (!firstLineLogged) {
      firstLineLogged = true
      finishStep(currentPythonStep, `pythonReady=${formatSeconds(spawnStart)}s`)
      console.log(`[13] Python inicializado en ${formatSeconds(spawnStart)} segundos`)
    }

    let event
    const parseStep = startStep(14, 'Resultado recibido desde Python')
    try {
      event = JSON.parse(trimmed)
      finishStep(parseStep, `type=${event.type || 'sin-type'}`)
    } catch (error) {
      failStep(parseStep, error)
      console.error(`[14] Salida no JSON de predict_batch.py: ${trimmed}`)
      continue
    }

    if (event.type === 'start') {
      console.log(`[12] Dispositivo: ${event.device}`)
      console.log(`[12] Procesando lote con ${event.total} imagenes`)
      continue
    }

    if (event.type === 'model_loaded') {
      console.log(`[12] SpeciesNet cargado en ${event.seconds} segundos | device=${event.device}`)
      continue
    }

    if (event.type === 'fatal') {
      throw new Error(event.error || 'SpeciesNet batch fatal error')
    }

    if (event.type !== 'prediction') {
      continue
    }

    const totalTarget = job.totalImages || preparedImages.length || event.total || 0
    const nextIndex = processedImages + failedImages + 1
    console.log(`[13] Procesando imagen ${nextIndex}/${totalTarget} path=${event.imagePath}`)

    const image = imageByDiskPath.get(path.resolve(event.imagePath))
    const imageStart = performance.now()

    try {
      if (!image || event.error) {
        failedImages += 1
        console.warn(`[14] Resultado con error o imagen no encontrada. error=${event.error || 'imagen no encontrada'}`)
      } else {
        const saveStep = startStep(15, 'Guardando deteccion', `species=${event.species} confidence=${event.confidence}`)
        try {
          const saveMs = await createDetectionFromPrediction({
            batchJobId: job.id,
            cameraId: job.cameraId || undefined,
            location,
            owner: job.user,
            prediction: event,
            publicPath: image.publicPath
          })
          dbSaveMs += saveMs
          processedImages += 1
          finishStep(saveStep, `postgres=${saveMs.toFixed(0)}ms`)
        } catch (error) {
          failStep(saveStep, error)
          throw error
        }
      }
    } catch (error) {
      failedImages += 1
      logException(`[15] Error guardando deteccion del lote ${job.id}`, error)
    }

    await withStep(16, 'Actualizando progreso', () => prisma.batchJob.update({
      data: { failedImages, processedImages },
      where: { id: job.id }
    }), `processed=${processedImages} failed=${failedImages}`)

    const imageSeconds = (performance.now() - lastImageAt) / 1000
    const totalCompleted = processedImages + failedImages
    const elapsedMinutes = Math.max((performance.now() - spawnStart) / 60000, 0.001)
    const speed = totalCompleted / elapsedMinutes
    lastImageAt = performance.now()

    console.log(`[17] Imagen completada ${totalCompleted}/${totalTarget} en ${imageSeconds.toFixed(2)} segundos | PostgreSQL ${(performance.now() - imageStart).toFixed(0)} ms | velocidad ${speed.toFixed(2)} imagenes/minuto | ${runtimeStats()}`)
  }

  if (!firstLineLogged) {
    finishStep(currentPythonStep, 'stdout cerrado sin lineas')
  }

  const exitCode = await withStep(18, 'Esperando cierre de predict_batch.py', () => new Promise((resolve) => child.on('close', resolve)))
  if (timeoutId) {
    clearTimeout(timeoutId)
  }

  if (exitCode !== 0) {
    throw new Error(`predict_batch.py finalizo con codigo ${exitCode}`)
  }

  return { dbSaveMs, failedImages, processedImages }
}

async function processJob(job) {
  const batchStart = performance.now()
  const batchRoot = path.join(process.cwd(), 'public', 'uploads', 'batches', String(job.id))
  const zipPath = path.join(batchRoot, job.zipName)
  const extractDir = path.join(batchRoot, 'extracted')
  const preparedDir = path.join(batchRoot, 'prepared')
  const location = job.camera ? `${job.camera.name} | ${job.camera.zone}` : 'Camara no asociada'

  try {
    await withStep(4, 'Verificando ZIP', async () => {
      if (!existsSync(zipPath)) {
        throw new Error(`No existe el ZIP del lote: ${zipPath}`)
      }
    }, zipPath)
    console.log(`[5] ZIP abierto correctamente path=${zipPath}`)

    await withStep(6, 'Limpiando carpeta de extraccion previa', () => rm(extractDir, { force: true, recursive: true }).catch(() => undefined), extractDir)
    await extractZip(zipPath, extractDir)

    const imageFiles = await withStep(7, 'Contando imagenes', () => listImageFiles(extractDir), extractDir)
    console.log(`[7] Total imagenes = ${imageFiles.length}`)

    if (imageFiles.length === 0) {
      await withStep(18, 'Finalizando lote sin imagenes', () => prisma.batchJob.update({
        data: {
          completedAt: new Date(),
          error: 'El ZIP no contiene imagenes compatibles',
          failedImages: 0,
          processedImages: 0,
          status: 'Con errores',
          totalImages: 0
        },
        where: { id: job.id }
      }))
      return
    }

    if (job.totalImages !== imageFiles.length) {
      await withStep(16, 'Actualizando total de imagenes', () => prisma.batchJob.update({ data: { totalImages: imageFiles.length }, where: { id: job.id } }), `total=${imageFiles.length}`)
      job.totalImages = imageFiles.length
    }

    const { failedCopies, preparedImages } = await prepareImagesForPrediction(imageFiles, preparedDir, job.id)
    await withStep(16, 'Actualizando progreso inicial', () => prisma.batchJob.update({ data: { failedImages: failedCopies, processedImages: 0 }, where: { id: job.id } }), `failedCopies=${failedCopies}`)

    if (preparedImages.length === 0) {
      throw new Error('No se pudieron preparar imagenes del ZIP para analisis')
    }

    const result = await runSpeciesNetBatch({ job, location, preparedDir, preparedImages })
    const status = result.failedImages > 0 ? 'Con errores' : 'Completado'

    await withStep(18, 'Finalizando lote', () => prisma.batchJob.update({
      data: {
        completedAt: new Date(),
        failedImages: result.failedImages,
        processedImages: result.processedImages,
        status
      },
      where: { id: job.id }
    }), `status=${status}`)

    console.log(`[18] Tiempo total del lote: ${formatSeconds(batchStart)} segundos`)
    console.log(`[18] Tiempo total guardando en PostgreSQL: ${(result.dbSaveMs / 1000).toFixed(2)} segundos`)
  } catch (error) {
    logException(`[batch-worker] Fallo general en lote ${job.id}`, error)
    await withStep(18, 'Marcando lote con errores', () => prisma.batchJob.update({
      data: {
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Error general procesando el lote',
        status: 'Con errores'
      },
      where: { id: job.id }
    }))
  } finally {
    await withStep(18, 'Limpiando carpeta temporal final', () => rm(extractDir, { force: true, recursive: true }).catch(() => undefined), extractDir)
  }
}

async function tick() {
  const job = await claimNextJob()

  if (!job) {
    return false
  }

  console.log(`[1] Lote encontrado y cargado id=${job.id} zip=${job.zipName} | ${runtimeStats()}`)
  await processJob(job)
  console.log(`[18] Lote ${job.id} finalizado | ${runtimeStats()}`)
  return true
}

async function main() {
  console.log(`[batch-worker] Iniciado. Poll cada ${pollIntervalMs} ms | warn step cada ${stepWarnMs} ms | ${runtimeStats()}`)

  if (runOnce) {
    await tick()
    return
  }

  while (true) {
    await tick()
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
}

main()
  .catch((error) => {
    logException('[batch-worker] Error fatal', error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (runOnce) {
      await prisma.$disconnect()
    }
  })