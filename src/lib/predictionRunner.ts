import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { calculatePriority } from '@/lib/detections'
import { prisma } from '@/lib/prisma'

const execAsync = promisify(exec)

export type PredictionResult = {
  species: string
  confidence: number
  coordinates?: [number, number, number, number] | null
  message?: string
  error?: string
  warning?: string
  model?: string
  rawLabel?: string
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

function quote(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`
}

function getDefaultModelPath() {
  const customModelPath = path.join(process.cwd(), 'python', 'best.pt')
  return existsSync(customModelPath) ? customModelPath : path.join(process.cwd(), 'yolov8n.pt')
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
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  const filename = `${Date.now()}-${sanitizeFilename(image.name || 'camera-trap.jpg')}`
  const diskPath = path.join(uploadDir, filename)
  const publicPath = `/uploads/${filename}`

  await mkdir(uploadDir, { recursive: true })
  await writeFile(diskPath, buffer)

  return { diskPath, publicPath }
}

export async function copyBatchImageToUploads(sourcePath: string, jobId: number) {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  const filename = `${Date.now()}-batch-${jobId}-${sanitizeFilename(path.basename(sourcePath))}`
  const diskPath = path.join(uploadDir, filename)
  const publicPath = `/uploads/${filename}`

  await mkdir(uploadDir, { recursive: true })
  await copyFile(sourcePath, diskPath)

  return { diskPath, publicPath }
}

export async function runPrediction(diskPath: string) {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const command = `${pythonBin} ${quote(path.join(process.cwd(), 'python', 'predict.py'))} ${quote(diskPath)}`
  const { stdout } = await execAsync(command, {
    env: {
      ...process.env,
      YOLO_MODEL_PATH: process.env.YOLO_MODEL_PATH || getDefaultModelPath()
    },
    timeout: 120000
  })

  return parsePrediction(stdout)
}

export async function runBatchPredictions(manifestPath: string) {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const command = `${pythonBin} ${quote(path.join(process.cwd(), 'python', 'predict_batch.py'))} ${quote(manifestPath)}`
  const { stdout } = await execAsync(command, {
    env: {
      ...process.env,
      YOLO_MODEL_PATH: process.env.YOLO_MODEL_PATH || getDefaultModelPath()
    },
    timeout: 120000 * 10
  })

  return parseBatchPredictions(stdout)
}

export async function createDetectionFromPrediction({
  batchJobId,
  location,
  owner,
  prediction,
  publicPath
}: {
  batchJobId?: number
  location: string
  owner: DetectionOwner
  prediction: PredictionResult
  publicPath: string
}) {
  const priority = calculatePriority(prediction.species, prediction.confidence)
  const coordinates = prediction.coordinates ?? null

  const detection = await prisma.detection.create({
    data: {
      batchJobId,
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

  return {
    confidence: detection.confidence,
    coordinates,
    createdAt: detection.createdAt.toISOString(),
    imagePath: detection.imagePath,
    location: detection.location,
    message: prediction.message,
    priority: detection.priority,
    researcher: owner.name,
    species: detection.species,
    userId: owner.id,
    warning: prediction.warning
  }
}
