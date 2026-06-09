import { exec } from 'node:child_process'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import {
  copyBatchImageToUploads,
  createDetectionFromPrediction,
  runBatchPredictions,
  sanitizeFilename
} from '@/lib/predictionRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execAsync = promisify(exec)
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])

function quotePowerShellLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

async function getCurrentUser() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) {
    return null
  }

  await ensureDatabase()

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true }
  })
}

async function listImageFiles(directory: string): Promise<string[]> {
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

function toPublicBatchJob(job: {
  id: number
  zipName: string
  status: string
  totalImages: number
  processedImages: number
  failedImages: number
  error: string | null
  createdAt: Date
  completedAt: Date | null
  user?: {
    id: number
    name: string
    email: string
  } | null
}) {
  return {
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    error: job.error,
    failedImages: job.failedImages,
    id: job.id,
    processedImages: job.processedImages,
    researcher: job.user?.name ?? null,
    researcherEmail: job.user?.email ?? null,
    status: job.status,
    totalImages: job.totalImages,
    zipName: job.zipName
  }
}

export async function GET() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  const isAdmin = isAdminRole(currentUser.role)
  const where: Prisma.BatchJobWhereInput = isAdmin ? {} : { userId: currentUser.id }
  const jobs = await prisma.batchJob.findMany({
    include: {
      user: {
        select: {
          email: true,
          id: true,
          name: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
    where
  })

  return NextResponse.json({
    jobs: jobs.map(toPublicBatchJob)
  })
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  const formData = await request.formData()
  const zip = formData.get('zip')
  const location = String(formData.get('location') || 'Camara 01 | Zona Norte')

  if (!(zip instanceof File) || !zip.name.toLowerCase().endsWith('.zip')) {
    return NextResponse.json({ error: 'Debes subir un archivo .zip' }, { status: 400 })
  }

  const job = await prisma.batchJob.create({
    data: {
      status: 'Procesando',
      userId: currentUser.id,
      zipName: sanitizeFilename(zip.name || 'imagenes.zip')
    }
  })

  const batchRoot = path.join(process.cwd(), 'public', 'uploads', 'batches', String(job.id))
  const extractDir = path.join(batchRoot, 'extracted')
  const zipPath = path.join(batchRoot, job.zipName)

  try {
    await mkdir(extractDir, { recursive: true })
    await writeFile(zipPath, Buffer.from(await zip.arrayBuffer()))

    await execAsync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath ${quotePowerShellLiteral(zipPath)} -DestinationPath ${quotePowerShellLiteral(extractDir)} -Force"`,
      { timeout: 120000 }
    )

    const imageFiles = await listImageFiles(extractDir)

    if (imageFiles.length === 0) {
      const failedJob = await prisma.batchJob.update({
        data: {
          completedAt: new Date(),
          error: 'El ZIP no contiene imagenes compatibles',
          status: 'Fallido',
          totalImages: 0
        },
        where: { id: job.id }
      })

      return NextResponse.json({ error: failedJob.error, job: toPublicBatchJob(failedJob) }, { status: 422 })
    }

    await prisma.batchJob.update({
      data: { totalImages: imageFiles.length },
      where: { id: job.id }
    })

    const uploadedImages = []

    for (const imagePath of imageFiles) {
      try {
        const uploadedImage = await copyBatchImageToUploads(imagePath, job.id)
        uploadedImages.push(uploadedImage)
      } catch (error) {
        console.error('Batch image copy error:', error)
      }
    }

    if (uploadedImages.length === 0) {
      throw new Error('No se pudieron preparar imagenes del ZIP para analisis')
    }

    const manifestPath = path.join(batchRoot, 'manifest.json')
    await writeFile(manifestPath, JSON.stringify(uploadedImages.map((image) => image.diskPath)), 'utf-8')

    const batchPredictions = await runBatchPredictions(manifestPath)
    const imageByDiskPath = new Map(uploadedImages.map((image) => [image.diskPath, image]))
    let processedImages = 0
    let failedImages = imageFiles.length - uploadedImages.length

    for (const batchPrediction of batchPredictions) {
      const uploadedImage = imageByDiskPath.get(batchPrediction.imagePath)

      if (!uploadedImage || batchPrediction.prediction.error) {
        failedImages += 1
      } else {
        await createDetectionFromPrediction({
          batchJobId: job.id,
          location,
          owner: currentUser,
          prediction: batchPrediction.prediction,
          publicPath: uploadedImage.publicPath
        })
        processedImages += 1
      }

      await prisma.batchJob.update({
        data: { failedImages, processedImages },
        where: { id: job.id }
      })
    }

    const completedJob = await prisma.batchJob.update({
      data: {
        completedAt: new Date(),
        failedImages,
        processedImages,
        status: failedImages === imageFiles.length ? 'Fallido' : failedImages > 0 ? 'Completado con errores' : 'Completado'
      },
      include: {
        user: {
          select: {
            email: true,
            id: true,
            name: true
          }
        }
      },
      where: { id: job.id }
    })

    await rm(extractDir, { force: true, recursive: true }).catch(() => undefined)

    return NextResponse.json({ job: toPublicBatchJob(completedJob) })
  } catch (error) {
    console.error('Batch API error:', error)

    const failedJob = await prisma.batchJob.update({
      data: {
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Error procesando el ZIP',
        status: 'Fallido'
      },
      include: {
        user: {
          select: {
            email: true,
            id: true,
            name: true
          }
        }
      },
      where: { id: job.id }
    })

    return NextResponse.json({ error: failedJob.error, job: toPublicBatchJob(failedJob) }, { status: 500 })
  }
}
