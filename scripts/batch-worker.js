const { execFile, spawn } = require('node:child_process')
const { copyFile, mkdir, readdir, rm, writeFile } = require('node:fs/promises')
const { existsSync } = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const { promisify } = require('node:util')
const { PrismaClient } = require('@prisma/client')
const {
  getFinalFailureError,
  getRetryError,
  getStaleCutoff,
  getWorkerConfig
} = require('./batch-worker-utils')
const { assignIndividualMatchForPrisma } = require('./individual-matching-utils')

function loadDotenv() {
  const envPath = path.join(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  const content = require('node:fs').readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [key, ...valueParts] = trimmed.split('=')
    const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadDotenv()

const prisma = new PrismaClient()
const execFileAsync = promisify(execFile)
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])
const pollIntervalMs = Number(process.env.BATCH_WORKER_POLL_MS || 3000)
const speciesNetBatchSize = Number(process.env.SPECIESNET_BATCH_SIZE || 8)
const progressMicrobatchSize = Number(process.env.PROGRESS_MICROBATCH_SIZE || 1)
const batchTimeoutMs = Number(process.env.SPECIESNET_BATCH_TIMEOUT_MS || 0)
const runOnce = process.argv.includes('--once')
const stepWarnMs = Number(process.env.BATCH_WORKER_STEP_WARN_MS || 20000)
const workerConfig = getWorkerConfig(process.env)

let cachedHasCaptureColumns = null
let shuttingDown = false
let activeJobId = null
let activeChild = null
let activeHeartbeatStop = null
let interruptedBySignal = null

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
  const step = { number, label, start: performance.now(), cpuStart: process.cpuUsage() }
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

function getStorageRoot() {
  return path.resolve(process.env.STORAGE_ROOT || path.join(process.cwd(), 'storage'))
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function getBatchRoot(jobId) {
  const storageRoot = path.join(getStorageRoot(), 'uploads', 'batches', String(jobId))
  const publicRoot = path.join(process.cwd(), 'public', 'uploads', 'batches', String(jobId))
  return existsSync(storageRoot) || !existsSync(publicRoot) ? storageRoot : publicRoot
}
function getProgressStatePath(batchRoot) {
  return path.join(batchRoot, '.progress.json')
}

async function writeProgressState(batchRoot, state) {
  const payload = { ...state, updatedAt: new Date().toISOString() }
  await writeFile(getProgressStatePath(batchRoot), JSON.stringify(payload, null, 2), 'utf8')
    .catch((error) => logException('[batch-worker] No se pudo escribir estado de progreso', error))
}

function mapPythonStage(event) {
  if (event.stage === 'starting_python') return 'Inicializando Python'
  if (event.stage === 'loading_speciesnet') return 'Cargando modelo de inteligencia artificial'
  if (event.stage === 'model_ready') return 'Modelo cargado. Procesando imagenes'
  if (event.stage === 'processing_images') return event.message || 'Procesando imagenes'
  return event.message || event.stage || 'Procesando'
}

function toStoredImagePath(diskPath) {
  const storageRoot = getStorageRoot()
  const publicRoot = path.join(process.cwd(), 'public')
  const resolved = path.resolve(diskPath)

  if (isInside(storageRoot, resolved)) {
    return path.relative(storageRoot, resolved).split(path.sep).join('/')
  }

  if (isInside(publicRoot, resolved)) {
    return `/${path.relative(publicRoot, resolved).split(path.sep).join('/')}`
  }

  throw new Error(`La imagen preparada esta fuera del almacenamiento permitido: ${diskPath}`)
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
  return species.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function calculatePriority(species, confidence) {
  const threatenedSpecies = new Set(['jaguar', 'leopard', 'tapir amazonico', 'puma', 'ocelot', 'oso de anteojos', 'pecari'])
  const normalizedSpecies = normalizeSpecies(species)
  const isBroadLabel = /\b(animal|mammal|bird|rodent|reptile|amphibian|fish|insect|family|species)\b/i.test(species)

  if (normalizedSpecies === 'sin deteccion' || normalizedSpecies === 'unknown' || normalizedSpecies === 'no cv result' || confidence <= 0 || isBroadLabel) {
    return 'Revision manual'
  }

  if (threatenedSpecies.has(normalizedSpecies) || confidence > 95) {
    return 'Alta prioridad'
  }

  return 'Normal'
}

function formatSeconds(start) {
  return ((performance.now() - start) / 1000).toFixed(2)
}

async function touchHeartbeat(jobId) {
  await prisma.batchJob.updateMany({
    data: { heartbeatAt: new Date() },
    where: { id: jobId, status: 'Procesando', workerId: workerConfig.workerId }
  })
}

function startHeartbeat(jobId) {
  void touchHeartbeat(jobId).catch((error) => logException(`[batch-worker] No se pudo actualizar heartbeat inicial lote ${jobId}`, error))
  const interval = setInterval(() => {
    void touchHeartbeat(jobId).catch((error) => logException(`[batch-worker] No se pudo actualizar heartbeat lote ${jobId}`, error))
  }, workerConfig.heartbeatSeconds * 1000)
  interval.unref?.()
  return () => clearInterval(interval)
}

async function listImageFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    if (entry.isSymbolicLink?.()) return []
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listImageFiles(entryPath)
    return imageExtensions.has(path.extname(entry.name).toLowerCase()) ? [entryPath] : []
  }))
  return files.flat()
}

async function extractZip(zipPath, extractDir) {
  await withStep(8, 'Preparando carpeta de extraccion', () => mkdir(extractDir, { recursive: true }), extractDir)
  await withStep(9, 'Extrayendo ZIP', () => execFileAsync(process.env.PYTHON_BIN || 'python', [path.join(process.cwd(), 'python', 'safe_zip.py'), 'extract', zipPath, extractDir], {
    env: process.env,
    timeout: 120000
  }), zipPath)
}

async function getExistingImagePaths(batchJobId) {
  const detections = await prisma.detection.findMany({ where: { batchJobId }, select: { imagePath: true } })
  return new Set(detections.map((detection) => detection.imagePath))
}

async function prepareImagesForPrediction(imageFiles, preparedDir, jobId, existingImagePaths) {
  await withStep(10, 'Preparando carpeta temporal', async () => {
    await rm(preparedDir, { force: true, recursive: true }).catch(() => undefined)
    await mkdir(preparedDir, { recursive: true })
  }, preparedDir)

  const preparedImages = []
  let failedCopies = 0
  let skippedExisting = 0

  const step = startStep(11, 'Copiando imagenes a carpeta preparada', `total=${imageFiles.length}`)
  try {
    for (const [index, imagePath] of imageFiles.entries()) {
      try {
        if (shuttingDown) throw new Error(`Worker detenido por ${interruptedBySignal || 'senal'}`)
        if (index === 0 || (index + 1) % 100 === 0 || index + 1 === imageFiles.length) {
          console.log(`[11] Preparando imagen ${index + 1}/${imageFiles.length}: ${imagePath} | ${runtimeStats(step)}`)
        }
        const filename = `${String(index + 1).padStart(6, '0')}-${sanitizeFilename(path.basename(imagePath))}`
        const diskPath = path.join(preparedDir, filename)
        const storedPath = toStoredImagePath(diskPath)
        if (existingImagePaths.has(storedPath)) {
          skippedExisting += 1
          continue
        }
        await copyFile(imagePath, diskPath)
        preparedImages.push({ diskPath, publicPath: storedPath })
      } catch (error) {
        failedCopies += 1
        logException(`[11] Error preparando imagen ${imagePath}`, error)
      }
    }
    finishStep(step, `preparadas=${preparedImages.length} existentes=${skippedExisting} fallidas=${failedCopies}`)
  } catch (error) {
    failStep(step, error)
    throw error
  }

  return { failedCopies, preparedImages, skippedExisting }
}

async function createDetectionFromPrediction({ batchJobId, cameraId, location, owner, prediction, publicPath }) {
  const start = performance.now()
  const existing = await prisma.detection.findFirst({ where: { batchJobId, imagePath: publicPath }, select: { id: true } })
  if (existing) {
    return { ms: performance.now() - start, skipped: true }
  }

  const priority = calculatePriority(prediction.species, prediction.confidence)
  const coordinates = prediction.coordinates || null
  const hasCaptureColumns = await hasDetectionCaptureColumns()
  const captureData = hasCaptureColumns ? {
    capturedAt: prediction.capturedAt ? new Date(prediction.capturedAt) : null,
    captureDateSource: prediction.captureDateSource || null
  } : {}

  const detection = await prisma.detection.create({
    data: {
      batchJobId,
      cameraId,
      cameraTrapCode: prediction.cameraTrapCode || null,
      confidence: prediction.confidence,
      imagePath: publicPath,
      location,
      priority,
      species: prediction.species,
      ...captureData,
      userId: owner.id,
      temperatureCelsius: prediction.temperatureCelsius ?? null,
      temperatureFahrenheit: prediction.temperatureFahrenheit ?? null,
      visibleMetadataText: prediction.visibleMetadataText || null,
      x1: coordinates?.[0],
      y1: coordinates?.[1],
      x2: coordinates?.[2],
      y2: coordinates?.[3]
    },
    select: { id: true }
  })
  await assignIndividualMatchForPrisma(prisma, detection.id).catch((error) => logException('[batch-worker] No se pudo asignar reencuentro', error))

  return { ms: performance.now() - start, skipped: false }
}

async function recoverStaleJobs() {
  const now = new Date()
  const staleCutoff = getStaleCutoff(now, workerConfig.staleMinutes)
  const staleJobs = await prisma.batchJob.findMany({
    orderBy: { startedAt: 'asc' },
    select: { attempts: true, heartbeatAt: true, id: true, startedAt: true, workerId: true, zipName: true },
    where: {
      status: 'Procesando',
      OR: [
        { heartbeatAt: { lt: staleCutoff } },
        { heartbeatAt: null, startedAt: { lt: staleCutoff } }
      ]
    },
    take: 20
  })

  for (const job of staleJobs) {
    if (Number(job.attempts || 0) < workerConfig.maxAttempts) {
      const message = getRetryError(job, workerConfig.staleMinutes)
      const result = await prisma.batchJob.updateMany({
        data: {
          heartbeatAt: null,
          lastError: message,
          nextRetryAt: now,
          status: 'Pendiente',
          workerId: null
        },
        where: { id: job.id, status: 'Procesando', workerId: job.workerId }
      })
      if (result.count === 1) console.warn(`[batch-worker] ${message} id=${job.id}`)
    } else {
      const message = getFinalFailureError(job, workerConfig.staleMinutes, workerConfig.maxAttempts)
      const result = await prisma.batchJob.updateMany({
        data: {
          completedAt: now,
          heartbeatAt: null,
          lastError: message,
          status: 'Fallido',
          workerId: null
        },
        where: { id: job.id, status: 'Procesando', workerId: job.workerId }
      })
      if (result.count === 1) console.error(`[batch-worker] ${message} id=${job.id}`)
    }
  }
}

async function claimNextJob() {
  await recoverStaleJobs()
  if (shuttingDown) return null

  const pendingJob = await withStep(1, 'Buscando lote pendiente', () => prisma.batchJob.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { attempts: true, id: true, zipName: true, createdAt: true },
    where: {
      status: 'Pendiente',
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }]
    }
  }))

  if (!pendingJob) {
    console.log('[1] No hay lotes pendientes')
    return null
  }

  console.log(`[1] Lote encontrado id=${pendingJob.id} zip=${pendingJob.zipName}`)
  const now = new Date()
  const nextAttempts = Number(pendingJob.attempts || 0) + 1

  const claimed = await withStep(2, 'Reclamando lote...', () => prisma.batchJob.updateMany({
    data: {
      attempts: { increment: 1 },
      completedAt: null,
      error: null,
      heartbeatAt: now,
      lastError: null,
      nextRetryAt: null,
      startedAt: now,
      status: 'Procesando',
      workerId: workerConfig.workerId
    },
    where: { id: pendingJob.id, status: 'Pendiente' }
  }), `id=${pendingJob.id} workerId=${workerConfig.workerId} attempt=${nextAttempts}`)

  if (claimed.count !== 1) {
    console.warn(`[3] Lote no reclamado id=${pendingJob.id}; otro proceso pudo tomarlo`)
    return null
  }

  console.log(`[3] Lote reclamado id=${pendingJob.id} workerId=${workerConfig.workerId}`)

  return withStep(3, 'Cargando lote reclamado', () => prisma.batchJob.findUnique({
    include: {
      camera: { select: { id: true, name: true, zone: true } },
      user: { select: { id: true, name: true } }
    },
    where: { id: pendingJob.id }
  }), `id=${pendingJob.id}`)
}

async function ensureNotCancelled(jobId) {
  if (shuttingDown) throw new Error(`Worker detenido por ${interruptedBySignal || 'senal'}`)
  const job = await prisma.batchJob.findUnique({ where: { id: jobId }, select: { cancelRequestedAt: true } })
  if (job?.cancelRequestedAt) {
    throw new Error('Cancelacion solicitada para el lote')
  }
}

async function runSpeciesNetBatch({ batchRoot, existingProcessed, job, preparedImages, preparedDir, location }) {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const scriptPath = path.join(process.cwd(), 'python', 'predict_batch.py')
  const imageByDiskPath = new Map(preparedImages.map((image) => [path.resolve(image.diskPath), image]))
  const args = ['-u', scriptPath, preparedDir, '--batch-size', String(Number.isFinite(speciesNetBatchSize) && speciesNetBatchSize > 0 ? speciesNetBatchSize : 8), '--microbatch-size', String(Number.isFinite(progressMicrobatchSize) && progressMicrobatchSize > 0 ? progressMicrobatchSize : 1)]
  const env = { ...process.env, SPECIESNET_COUNTRY: process.env.SPECIESNET_COUNTRY || 'ECU', PYTHONUNBUFFERED: '1' }
  const spawnStart = performance.now()
  let firstLineLogged = false
  let processedImages = existingProcessed
  let failedImages = Math.max(0, job.totalImages - existingProcessed - preparedImages.length)
  let dbSaveMs = 0
  let lastImageAt = performance.now()
  let timeoutId = null
  let currentPythonStep = startStep(12, 'Iniciando predict_batch.py', `${pythonBin} ${args.join(' ')}`)

  const child = spawn(pythonBin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  activeChild = child
  finishStep(currentPythonStep, `pid=${child.pid || 'sin-pid'}`)
  currentPythonStep = startStep(13, 'Esperando salida inicial de predict_batch.py')

  if (batchTimeoutMs > 0) {
    timeoutId = setTimeout(() => {
      console.error(`[batch-worker] Timeout de lote ${job.id}; cerrando proceso Python`)
      child.kill('SIGTERM')
    }, batchTimeoutMs)
  }

  child.on('error', (error) => logException(`[12] Error iniciando proceso Python para lote ${job.id}`, error))
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim()
    if (text) console.error(`[python stderr] ${text}`)
  })

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })

  try {
    for await (const line of rl) {
      const trimmed = line.trim()
      if (!trimmed) continue

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

      if (event.type === 'stage') {
        const stage = mapPythonStage(event)
        console.log(`[12] Etapa Python: ${stage}`)
        await writeProgressState(batchRoot, { stage, pythonStage: event.stage, totalImages: event.total ?? job.totalImages })
        continue
      }

      if (event.type === 'start') {
        console.log(`[12] Dispositivo: ${event.device}`)
        console.log(`[12] Procesando lote con ${event.total} imagenes`)
        await writeProgressState(batchRoot, { stage: 'Cargando modelo de inteligencia artificial', pythonStage: 'loading_speciesnet', totalImages: event.total })
        continue
      }

      if (event.type === 'model_loaded') {
        console.log(`[12] SpeciesNet cargado en ${event.seconds} segundos | device=${event.device}`)
        await writeProgressState(batchRoot, { stage: 'Modelo cargado. Procesando imagenes', pythonStage: 'model_ready', totalImages: job.totalImages, modelLoadSeconds: event.seconds })
        continue
      }

      if (event.type === 'complete' || event.type === 'done') {
        await writeProgressState(batchRoot, { stage: 'Finalizando lote', pythonStage: event.type, totalImages: event.total ?? job.totalImages })
        continue
      }

      if (event.type === 'fatal') throw new Error(event.error || 'SpeciesNet batch fatal error')
      if (event.type !== 'prediction' && event.type !== 'result') continue

      await ensureNotCancelled(job.id)
      const totalTarget = job.totalImages || existingProcessed + preparedImages.length || event.total || 0
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
            const save = await createDetectionFromPrediction({
              batchJobId: job.id,
              cameraId: job.cameraId || undefined,
              location,
              owner: job.user,
              prediction: event,
              publicPath: image.publicPath
            })
            dbSaveMs += save.ms
            processedImages += 1
            finishStep(saveStep, `postgres=${save.ms.toFixed(0)}ms skipped=${save.skipped}`)
          } catch (error) {
            failStep(saveStep, error)
            throw error
          }
        }
      } catch (error) {
        failedImages += 1
        logException(`[15] Error guardando deteccion del lote ${job.id}`, error)
      }

      await withStep(16, 'Actualizando progreso', () => prisma.batchJob.updateMany({
        data: { failedImages, heartbeatAt: new Date(), processedImages },
        where: { id: job.id, status: 'Procesando', workerId: workerConfig.workerId }
      }), `processed=${processedImages} failed=${failedImages}`)
      await writeProgressState(batchRoot, { stage: `Procesando imagen ${processedImages + failedImages} de ${totalTarget}`, pythonStage: 'processing_images', processedImages, failedImages, totalImages: totalTarget })

      const imageSeconds = (performance.now() - lastImageAt) / 1000
      const totalCompleted = processedImages + failedImages
      const elapsedMinutes = Math.max((performance.now() - spawnStart) / 60000, 0.001)
      const speed = totalCompleted / elapsedMinutes
      lastImageAt = performance.now()
      console.log(`[17] Imagen completada ${totalCompleted}/${totalTarget} en ${imageSeconds.toFixed(2)} segundos | PostgreSQL ${(performance.now() - imageStart).toFixed(0)} ms | velocidad ${speed.toFixed(2)} imagenes/minuto | ${runtimeStats()}`)
    }
  } finally {
    activeChild = null
    if (timeoutId) clearTimeout(timeoutId)
  }

  if (!firstLineLogged) finishStep(currentPythonStep, 'stdout cerrado sin lineas')
  const exitCode = await withStep(18, 'Esperando cierre de predict_batch.py', () => new Promise((resolve) => child.on('close', resolve)))
  if (exitCode !== 0) throw new Error(`predict_batch.py finalizo con codigo ${exitCode}`)
  return { dbSaveMs, failedImages, processedImages }
}

async function markJobFailure(job, error) {
  const message = error instanceof Error ? error.message : 'Error general procesando el lote'
  const canRetry = Number(job.attempts || 0) < workerConfig.maxAttempts
  const data = canRetry
    ? { error: message, heartbeatAt: null, lastError: message, nextRetryAt: new Date(), status: 'Pendiente', workerId: null }
    : { completedAt: new Date(), error: message, heartbeatAt: null, lastError: message, status: 'Fallido', workerId: null }
  await withStep(18, canRetry ? 'Reencolando lote con error' : 'Marcando lote fallido', () => prisma.batchJob.updateMany({
    data,
    where: { id: job.id, status: 'Procesando', workerId: workerConfig.workerId }
  }), `id=${job.id} retry=${canRetry}`)
}

async function processJob(job) {
  const batchStart = performance.now()
  const batchRoot = getBatchRoot(job.id)
  const zipPath = path.join(batchRoot, job.zipName)
  const extractDir = path.join(batchRoot, 'extracted')
  const preparedDir = path.join(batchRoot, 'prepared')
  const location = job.camera ? `${job.camera.name} | ${job.camera.zone}` : 'Camara no asociada'
  activeJobId = job.id
  activeHeartbeatStop = startHeartbeat(job.id)

  try {
    await writeProgressState(batchRoot, { stage: 'Preparando ZIP', pythonStage: 'preparing_zip', totalImages: job.totalImages })
    await withStep(4, 'Verificando ZIP', async () => {
      if (!existsSync(zipPath)) throw new Error(`No existe el ZIP del lote: ${zipPath}`)
    }, zipPath)
    console.log(`[5] ZIP abierto correctamente path=${zipPath}`)

    await withStep(6, 'Limpiando carpeta de extraccion previa', () => rm(extractDir, { force: true, recursive: true }).catch(() => undefined), extractDir)
    await writeProgressState(batchRoot, { stage: 'Extrayendo archivos', pythonStage: 'extracting_zip', totalImages: job.totalImages })
    await extractZip(zipPath, extractDir)

    const imageFiles = await withStep(7, 'Contando imagenes', () => listImageFiles(extractDir), extractDir)
    console.log(`[7] Total imagenes = ${imageFiles.length}`)

    if (imageFiles.length === 0) {
      await withStep(18, 'Finalizando lote sin imagenes', () => prisma.batchJob.updateMany({
        data: {
          completedAt: new Date(),
          error: 'El ZIP no contiene imagenes compatibles',
          failedImages: 0,
          heartbeatAt: null,
          lastError: 'El ZIP no contiene imagenes compatibles',
          processedImages: 0,
          status: 'Fallido',
          totalImages: 0,
          workerId: null
        },
        where: { id: job.id, status: 'Procesando', workerId: workerConfig.workerId }
      }))
      return
    }

    if (job.totalImages !== imageFiles.length) {
      await withStep(16, 'Actualizando total de imagenes', () => prisma.batchJob.updateMany({ data: { heartbeatAt: new Date(), totalImages: imageFiles.length }, where: { id: job.id, status: 'Procesando', workerId: workerConfig.workerId } }), `total=${imageFiles.length}`)
      job.totalImages = imageFiles.length
    }

    const existingImagePaths = await withStep(11, 'Consultando detecciones existentes del lote', () => getExistingImagePaths(job.id), `id=${job.id}`)
    await writeProgressState(batchRoot, { stage: 'Preparando imagenes', pythonStage: 'preparing_images', totalImages: imageFiles.length })
    const { failedCopies, preparedImages, skippedExisting } = await prepareImagesForPrediction(imageFiles, preparedDir, job.id, existingImagePaths)
    await withStep(16, 'Actualizando progreso inicial', () => prisma.batchJob.updateMany({ data: { failedImages: failedCopies, heartbeatAt: new Date(), processedImages: skippedExisting }, where: { id: job.id, status: 'Procesando', workerId: workerConfig.workerId } }), `existing=${skippedExisting} failedCopies=${failedCopies}`)

    if (preparedImages.length === 0) {
      const status = failedCopies > 0 ? 'Con errores' : 'Completado'
      await withStep(18, 'Finalizando lote sin pendientes nuevos', () => prisma.batchJob.updateMany({
        data: { completedAt: new Date(), failedImages: failedCopies, heartbeatAt: null, processedImages: skippedExisting, status, workerId: null },
        where: { id: job.id, status: 'Procesando', workerId: workerConfig.workerId }
      }), `status=${status}`)
      return
    }

    await writeProgressState(batchRoot, { stage: 'Cargando modelo de inteligencia artificial', pythonStage: 'loading_speciesnet', totalImages: job.totalImages })
    const result = await runSpeciesNetBatch({ batchRoot, existingProcessed: skippedExisting, job, location, preparedDir, preparedImages })
    const status = result.failedImages > 0 ? 'Con errores' : 'Completado'

    await withStep(18, 'Finalizando lote', () => prisma.batchJob.updateMany({
      data: {
        completedAt: new Date(),
        error: null,
        failedImages: result.failedImages,
        heartbeatAt: null,
        lastError: null,
        processedImages: result.processedImages,
        status,
        workerId: null
      },
      where: { id: job.id, status: 'Procesando', workerId: workerConfig.workerId }
    }), `status=${status}`)

    console.log(`[18] Tiempo total del lote: ${formatSeconds(batchStart)} segundos`)
    console.log(`[18] Tiempo total guardando en PostgreSQL: ${(result.dbSaveMs / 1000).toFixed(2)} segundos`)
  } catch (error) {
    logException(`[batch-worker] Fallo general en lote ${job.id}`, error)
    await markJobFailure(job, error)
  } finally {
    if (activeHeartbeatStop) activeHeartbeatStop()
    activeHeartbeatStop = null
    activeJobId = null
    await withStep(18, 'Limpiando carpeta temporal final', () => rm(extractDir, { force: true, recursive: true }).catch(() => undefined), extractDir)
  }
}

async function tick() {
  const job = await claimNextJob()
  if (!job) return false
  console.log(`[1] Lote encontrado y cargado id=${job.id} zip=${job.zipName} | ${runtimeStats()}`)
  await processJob(job)
  console.log(`[18] Lote ${job.id} finalizado o reencolado | ${runtimeStats()}`)
  return true
}

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  interruptedBySignal = signal
  console.warn(`[batch-worker] Recibido ${signal}. Se detendra de forma segura.`)
  if (activeChild) activeChild.kill('SIGTERM')
  if (!activeJobId) {
    await prisma.$disconnect()
    process.exit(0)
  }
}

process.once('SIGINT', () => { void shutdown('SIGINT') })
process.once('SIGTERM', () => { void shutdown('SIGTERM') })

async function main() {
  console.log(`[batch-worker] Iniciado workerId=${workerConfig.workerId}. Poll cada ${pollIntervalMs} ms | heartbeat ${workerConfig.heartbeatSeconds}s | stale ${workerConfig.staleMinutes}m | maxAttempts ${workerConfig.maxAttempts} | ${runtimeStats()}`)
  if (runOnce) {
    await tick()
    return
  }
  while (!shuttingDown) {
    await tick()
    if (!shuttingDown) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
}

main()
  .catch((error) => {
    logException('[batch-worker] Error fatal', error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (activeHeartbeatStop) activeHeartbeatStop()
    await prisma.$disconnect()
  })
