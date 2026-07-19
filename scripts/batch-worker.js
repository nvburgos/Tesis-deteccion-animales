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
  await mkdir(extractDir, { recursive: true })
  const script = [
    'import sys, zipfile',
    'zip_path, out_dir = sys.argv[1], sys.argv[2]',
    'with zipfile.ZipFile(zip_path) as archive:',
    '    archive.extractall(out_dir)',
  ].join('\n')

  await execFileAsync(process.env.PYTHON_BIN || 'python', ['-c', script, zipPath, extractDir], { timeout: 120000 })
}

async function prepareImagesForPrediction(imageFiles, preparedDir, jobId) {
  await rm(preparedDir, { force: true, recursive: true }).catch(() => undefined)
  await mkdir(preparedDir, { recursive: true })

  const preparedImages = []
  let failedCopies = 0

  for (const [index, imagePath] of imageFiles.entries()) {
    try {
      const filename = `${String(index + 1).padStart(6, '0')}-${sanitizeFilename(path.basename(imagePath))}`
      const diskPath = path.join(preparedDir, filename)
      await copyFile(imagePath, diskPath)
      preparedImages.push({ diskPath, publicPath: toPublicPath(diskPath) })
    } catch (error) {
      failedCopies += 1
      console.error(`[batch-worker] Error preparando imagen ${imagePath}:`, error)
    }
  }

  return { failedCopies, preparedImages }
}

async function createDetectionFromPrediction({ batchJobId, cameraId, location, owner, prediction, publicPath }) {
  const priority = calculatePriority(prediction.species, prediction.confidence)
  const coordinates = prediction.coordinates || null

  const start = performance.now()
  await prisma.detection.create({
    data: {
      batchJobId,
      cameraId,
      confidence: prediction.confidence,
      imagePath: publicPath,
      location,
      priority,
      species: prediction.species,
      userId: owner.id,
      x1: coordinates?.[0],
      y1: coordinates?.[1],
      x2: coordinates?.[2],
      y2: coordinates?.[3]
    }
  })

  return performance.now() - start
}

async function claimNextJob() {
  const pendingJob = await prisma.batchJob.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
    where: { status: 'Pendiente' }
  })

  if (!pendingJob) {
    return null
  }

  const claimed = await prisma.batchJob.updateMany({
    data: { error: null, status: 'Procesando' },
    where: { id: pendingJob.id, status: 'Pendiente' }
  })

  if (claimed.count !== 1) {
    return null
  }

  return prisma.batchJob.findUnique({
    include: {
      camera: { select: { id: true, name: true, zone: true } },
      user: { select: { id: true, name: true } }
    },
    where: { id: pendingJob.id }
  })
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

  console.log(`[batch-worker] Ejecutando Python una vez para lote ${job.id}`)
  const child = spawn(pythonBin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })

  if (batchTimeoutMs > 0) {
    timeoutId = setTimeout(() => {
      console.error(`[batch-worker] Timeout de lote ${job.id}; cerrando proceso Python`)
      child.kill('SIGTERM')
    }, batchTimeoutMs)
  }

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim()
    if (text) {
      console.error(text)
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
      console.log(`[batch-worker] Python inicializado en ${formatSeconds(spawnStart)} segundos`)
    }

    let event
    try {
      event = JSON.parse(trimmed)
    } catch (error) {
      console.error(`[batch-worker] Salida no JSON de predict_batch.py: ${trimmed}`)
      continue
    }

    if (event.type === 'start') {
      console.log(`[batch-worker] Dispositivo: ${event.device}`)
      console.log(`[batch-worker] Procesando lote con ${event.total} imagenes`)
      continue
    }

    if (event.type === 'model_loaded') {
      console.log(`[batch-worker] SpeciesNet cargado en ${event.seconds} segundos`)
      continue
    }

    if (event.type === 'fatal') {
      throw new Error(event.error || 'SpeciesNet batch fatal error')
    }

    if (event.type !== 'prediction') {
      continue
    }

    const image = imageByDiskPath.get(path.resolve(event.imagePath))
    const imageStart = performance.now()

    try {
      if (!image || event.error) {
        failedImages += 1
      } else {
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
      }
    } catch (error) {
      failedImages += 1
      console.error(`[batch-worker] Error guardando deteccion del lote ${job.id}:`, error)
    }

    await prisma.batchJob.update({
      data: { failedImages, processedImages },
      where: { id: job.id }
    })

    const imageSeconds = (performance.now() - lastImageAt) / 1000
    const totalCompleted = processedImages + failedImages
    const elapsedMinutes = Math.max((performance.now() - spawnStart) / 60000, 0.001)
    const speed = totalCompleted / elapsedMinutes
    lastImageAt = performance.now()

    console.log(
      `[batch-worker] Imagen ${totalCompleted}/${job.totalImages || preparedImages.length} completada en ${imageSeconds.toFixed(2)} segundos`
    )
    console.log(`[batch-worker] Guardado PostgreSQL: ${(performance.now() - imageStart).toFixed(0)} ms`)
    console.log(`[batch-worker] Velocidad media: ${speed.toFixed(2)} imagenes/minuto`)
  }

  const exitCode = await new Promise((resolve) => child.on('close', resolve))
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
    if (!existsSync(zipPath)) {
      throw new Error(`No existe el ZIP del lote: ${zipPath}`)
    }

    await rm(extractDir, { force: true, recursive: true }).catch(() => undefined)
    await extractZip(zipPath, extractDir)

    const imageFiles = await listImageFiles(extractDir)

    if (imageFiles.length === 0) {
      await prisma.batchJob.update({
        data: {
          completedAt: new Date(),
          error: 'El ZIP no contiene imagenes compatibles',
          failedImages: 0,
          processedImages: 0,
          status: 'Con errores',
          totalImages: 0
        },
        where: { id: job.id }
      })
      return
    }

    if (job.totalImages !== imageFiles.length) {
      await prisma.batchJob.update({ data: { totalImages: imageFiles.length }, where: { id: job.id } })
      job.totalImages = imageFiles.length
    }

    const { failedCopies, preparedImages } = await prepareImagesForPrediction(imageFiles, preparedDir, job.id)
    await prisma.batchJob.update({ data: { failedImages: failedCopies, processedImages: 0 }, where: { id: job.id } })

    if (preparedImages.length === 0) {
      throw new Error('No se pudieron preparar imagenes del ZIP para analisis')
    }

    const result = await runSpeciesNetBatch({ job, location, preparedDir, preparedImages })
    const status = result.failedImages > 0 ? 'Con errores' : 'Completado'

    await prisma.batchJob.update({
      data: {
        completedAt: new Date(),
        failedImages: result.failedImages,
        processedImages: result.processedImages,
        status
      },
      where: { id: job.id }
    })

    console.log(`[batch-worker] Tiempo total del lote: ${formatSeconds(batchStart)} segundos`)
    console.log(`[batch-worker] Tiempo total guardando en PostgreSQL: ${(result.dbSaveMs / 1000).toFixed(2)} segundos`)
  } catch (error) {
    console.error(`[batch-worker] Fallo general en lote ${job.id}:`, error)
    await prisma.batchJob.update({
      data: {
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Error general procesando el lote',
        status: 'Con errores'
      },
      where: { id: job.id }
    })
  } finally {
    await rm(extractDir, { force: true, recursive: true }).catch(() => undefined)
  }
}

async function tick() {
  const job = await claimNextJob()

  if (!job) {
    return false
  }

  console.log(`[batch-worker] Procesando lote ${job.id}: ${job.zipName}`)
  await processJob(job)
  console.log(`[batch-worker] Lote ${job.id} finalizado`)
  return true
}

async function main() {
  console.log(`[batch-worker] Iniciado. Poll cada ${pollIntervalMs} ms`)

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
    console.error('[batch-worker] Error fatal:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (runOnce) {
      await prisma.$disconnect()
    }
  })
