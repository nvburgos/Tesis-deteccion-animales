import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { calculatePriority } from '@/lib/detections'
import { prisma } from '@/lib/prisma'
import { hasDetectionCaptureColumns } from '@/lib/detectionCaptureColumns'
import { getStorageRoot, toProtectedDetectionImagePath } from '@/lib/fileStorage'
import { assignIndividualMatch } from '@/lib/individualMatching'

const execFileAsync = promisify(execFile)
const defaultMaxImageDimension = 1280

export type PredictionResult = {
  species: string
  confidence: number
  coordinates?: [number, number, number, number] | null
  message?: string
  error?: string
  warning?: string
  model?: string
  rawLabel?: string
  capturedAt?: string | null
  captureDateSource?: string | null
  cameraTrapCode?: string | null
  temperatureCelsius?: number | null
  temperatureFahrenheit?: number | null
  visibleMetadataText?: string | null
}

export type BatchPredictionResult = {
  imagePath: string
  prediction: PredictionResult
}

export type DetectionOwner = {
  id: number
  name: string
}

export function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase()
}

function getDefaultModelPath() {
  const customModelPath = path.join(process.cwd(), 'python', 'best.pt')
  return existsSync(customModelPath) ? customModelPath : path.join(process.cwd(), 'yolov8n.pt')
}

function getMaxImageDimension() {
  const configuredValue = Number(process.env.ANALYSIS_MAX_IMAGE_DIMENSION ?? defaultMaxImageDimension)
  return Number.isFinite(configuredValue) && configuredValue > 0 ? configuredValue : defaultMaxImageDimension
}

async function optimizeImageForAnalysis(buffer: Buffer) {
  const maxDimension = getMaxImageDimension()

  try {
    const optimizedBuffer = await sharp(buffer)
      .rotate()
      .resize({
        fit: 'inside',
        height: maxDimension,
        width: maxDimension,
        withoutEnlargement: true
      })
      .jpeg({ mozjpeg: true, quality: 82 })
      .toBuffer()

    return {
      buffer: optimizedBuffer,
      extension: '.jpg'
    }
  } catch (error) {
    console.warn('Image optimization failed, saving original upload:', error)

    return {
      buffer,
      extension: null
    }
  }
}

function parsePrediction(stdout: string): PredictionResult {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const jsonLine = lines.findLast((line) => line.startsWith('{') && line.endsWith('}'))

  if (!jsonLine) {
    throw new Error('Python did not return JSON output')
  }

  const parsed = JSON.parse(jsonLine) as PredictionResult

  if (!parsed.species || typeof parsed.confidence !== 'number') {
    throw new Error('Invalid prediction JSON output')
  }

  return parsed
}

function getPredictionEnvironment() {
  return {
    ...process.env,
    YOLO_MODEL_PATH: process.env.YOLO_MODEL_PATH || getDefaultModelPath()
  }
}

function parseBatchPredictions(stdout: string): BatchPredictionResult[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const jsonLine = lines.findLast((line) => line.startsWith('{') && line.endsWith('}'))

  if (!jsonLine) {
    throw new Error('Python did not return batch JSON output')
  }

  const parsed = JSON.parse(jsonLine) as { results?: BatchPredictionResult[] }

  if (!Array.isArray(parsed.results)) {
    throw new Error('Invalid batch prediction JSON output')
  }

  return parsed.results
}

export async function saveUploadedImage(image: File) {
  const bytes = await image.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const uploadDir = path.join(getStorageRoot(), 'uploads')
  const optimizedImage = await optimizeImageForAnalysis(buffer)
  const originalName = sanitizeFilename(image.name || 'camera-trap.jpg')
  const parsedName = path.parse(originalName)
  const filename = optimizedImage.extension
    ? `${Date.now()}-${sanitizeFilename(parsedName.name || 'camera-trap')}${optimizedImage.extension}`
    : `${Date.now()}-${originalName}`
  const diskPath = path.join(uploadDir, filename)
  const publicPath = `uploads/${filename}`

  await mkdir(uploadDir, { recursive: true })
  await writeFile(diskPath, optimizedImage.buffer)

  return { diskPath, publicPath }
}

export async function copyBatchImageToUploads(sourcePath: string, jobId: number) {
  const uploadDir = path.join(getStorageRoot(), 'uploads')
  const filename = `${Date.now()}-batch-${jobId}-${sanitizeFilename(path.basename(sourcePath))}`
  const diskPath = path.join(uploadDir, filename)
  const publicPath = `uploads/${filename}`

  await mkdir(uploadDir, { recursive: true })
  await copyFile(sourcePath, diskPath)

  return { diskPath, publicPath }
}

export async function runPrediction(diskPath: string) {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const { stdout } = await execFileAsync(pythonBin, [path.join(process.cwd(), 'python', 'predict.py'), diskPath], {
    env: getPredictionEnvironment(),
    timeout: 120000
  })

  return parsePrediction(stdout)
}

export async function runBatchPredictions(manifestPath: string) {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const { stdout } = await execFileAsync(pythonBin, [path.join(process.cwd(), 'python', 'predict_batch.py'), manifestPath], {
    env: getPredictionEnvironment(),
    timeout: 120000 * 10
  })

  return parseBatchPredictions(stdout)
}

export async function createDetectionFromPrediction({
  batchJobId,
  cameraId,
  location,
  owner,
  prediction,
  publicPath
}: {
  batchJobId?: number
  cameraId?: number
  location: string
  owner: DetectionOwner
  prediction: PredictionResult
  publicPath: string
}) {
  const priority = calculatePriority(prediction.species, prediction.confidence)
  const coordinates = prediction.coordinates ?? null

  const hasCaptureColumns = await hasDetectionCaptureColumns()
  const captureData = hasCaptureColumns ? {
    capturedAt: prediction.capturedAt ? new Date(prediction.capturedAt) : null,
    captureDateSource: prediction.captureDateSource ?? null
  } : {}

  const detection = await prisma.detection.create({
    data: {
      batchJobId,
      cameraId,
      cameraTrapCode: prediction.cameraTrapCode ?? null,
      confidence: prediction.confidence,
      imagePath: publicPath,
      location,
      priority,
      species: prediction.species,
      ...captureData,
      userId: owner.id,
      temperatureCelsius: prediction.temperatureCelsius ?? null,
      temperatureFahrenheit: prediction.temperatureFahrenheit ?? null,
      visibleMetadataText: prediction.visibleMetadataText ?? null,
      x1: coordinates?.[0],
      y1: coordinates?.[1],
      x2: coordinates?.[2],
      y2: coordinates?.[3]
    },
    select: {
      id: true,
      confidence: true,
      createdAt: true,
      ...(hasCaptureColumns ? { capturedAt: true, captureDateSource: true } : {}),
      cameraId: true,
      cameraTrapCode: true,
      imagePath: true,
      location: true,
      priority: true,
      species: true,
      temperatureCelsius: true,
      temperatureFahrenheit: true,
      visibleMetadataText: true
    }
  })
  const individualMatch = await assignIndividualMatch(detection.id).catch((error) => {
    console.error('No se pudo asignar reencuentro para la deteccion:', error)
    return null
  })

  return {
    confidence: detection.confidence,
    coordinates,
    createdAt: detection.createdAt.toISOString(),
    capturedAt: detection.capturedAt?.toISOString() ?? null,
    captureDateSource: detection.captureDateSource,
    cameraId: detection.cameraId,
    cameraTrapCode: detection.cameraTrapCode,
    imagePath: toProtectedDetectionImagePath(detection.id),
    location: detection.location,
    message: prediction.message,
    priority: detection.priority,
    researcher: owner.name,
    species: detection.species,
    userId: owner.id,
    temperatureCelsius: detection.temperatureCelsius,
    temperatureFahrenheit: detection.temperatureFahrenheit,
    visibleMetadataText: detection.visibleMetadataText,
    individualId: individualMatch?.individualId ?? null,
    individualMatchStatus: individualMatch?.individualMatchStatus ?? null,
    individualMatchConfidence: individualMatch?.individualMatchConfidence ?? null,
    individualMatchBasis: individualMatch?.individualMatchBasis ?? null,
    individual: individualMatch?.individual ?? null,
    warning: prediction.warning
  }
}



