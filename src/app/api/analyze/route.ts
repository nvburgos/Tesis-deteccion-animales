import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ensureDatabase } from '@/lib/database'
import { calculatePriority } from '@/lib/detections'
import { prisma } from '@/lib/prisma'
import { AUTH_COOKIE, getSessionUserId } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execAsync = promisify(exec)

type PredictionResult = {
  species: string
  confidence: number
  coordinates?: [number, number, number, number] | null
  message?: string
  error?: string
  warning?: string
  model?: string
  rawLabel?: string
}

function sanitizeFilename(filename: string) {
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

export async function POST(request: Request) {
  try {
    const session = (await cookies()).get(AUTH_COOKIE)?.value
    const userId = getSessionUserId(session)

    if (!userId) {
      return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
    }

    await ensureDatabase()

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'Sesion invalida' }, { status: 401 })
    }

    const formData = await request.formData()
    const image = formData.get('image')
    const location = String(formData.get('location') || 'Camara 01 | Zona Norte')

    if (!(image instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
    }

    const bytes = await image.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    const filename = `${Date.now()}-${sanitizeFilename(image.name || 'camera-trap.jpg')}`
    const diskPath = path.join(uploadDir, filename)
    const publicPath = `/uploads/${filename}`

    await mkdir(uploadDir, { recursive: true })
    await writeFile(diskPath, buffer)

    const pythonBin = process.env.PYTHON_BIN || 'python'
    const command = `${pythonBin} ${quote(path.join(process.cwd(), 'python', 'predict.py'))} ${quote(diskPath)}`
    const { stdout } = await execAsync(command, {
      env: {
        ...process.env,
        YOLO_MODEL_PATH: process.env.YOLO_MODEL_PATH || getDefaultModelPath()
      },
      timeout: 120000
    })

    const prediction = parsePrediction(stdout)

    if (prediction.error) {
      return NextResponse.json(
        {
          error: prediction.error,
          species: prediction.species,
          confidence: prediction.confidence,
          imagePath: publicPath,
          location,
          priority: calculatePriority(prediction.species, prediction.confidence),
          warning: prediction.warning,
          message: prediction.message
        },
        { status: 422 }
      )
    }

    const priority = calculatePriority(prediction.species, prediction.confidence)
    const coordinates = prediction.coordinates ?? null

    const detection = await prisma.detection.create({
      data: {
        imagePath: publicPath,
        species: prediction.species,
        confidence: prediction.confidence,
        location,
        priority,
        userId: user.id,
        x1: coordinates?.[0],
        y1: coordinates?.[1],
        x2: coordinates?.[2],
        y2: coordinates?.[3]
      }
    })

    return NextResponse.json({
      species: detection.species,
      confidence: detection.confidence,
      imagePath: detection.imagePath,
      location: detection.location,
      priority: detection.priority,
      researcher: user.name,
      userId: user.id,
      createdAt: detection.createdAt.toISOString(),
      coordinates,
      message: prediction.message,
      warning: prediction.warning
    })
  } catch (error) {
    console.error('Analyze API error:', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Error interno analizando la imagen'
      },
      { status: 500 }
    )
  }
}
