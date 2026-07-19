import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { formatRelativeDate } from '@/lib/detections'

export const dynamic = 'force-dynamic'

async function getCurrentUser() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) {
    return null
  }

  await ensureDatabase()

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true }
  })
}

async function getBatchId(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const batchId = Number(id)

  if (!Number.isInteger(batchId) || batchId <= 0) {
    return null
  }

  return batchId
}

function normalizePriority(priority: string) {
  if (priority === 'Alta') {
    return 'Alta prioridad'
  }

  if (priority === 'Revisión manual') {
    return 'Revision manual'
  }

  return priority
}

function getBatchProgress(job: {
  totalImages: number
  processedImages: number
  failedImages: number
}) {
  const completedUnits = job.processedImages + job.failedImages
  const pendingImages = Math.max(0, job.totalImages - completedUnits)
  const percentage = job.totalImages > 0 ? Math.min(100, Math.round((completedUnits / job.totalImages) * 100)) : null

  return { pendingImages, percentage }
}

function toPublicDetection(detection: {
  id: number
  imagePath: string
  species: string
  confidence: number
  location: string
  priority: string
  cameraId: number | null
  batchJobId: number | null
  x1: number | null
  y1: number | null
  x2: number | null
  y2: number | null
  manualReviewedAt: Date | null
  manualReviewNote: string | null
  createdAt: Date
  capturedAt?: Date | null
  captureDateSource?: string | null
  userId: number | null
  camera?: {
    id: number
    code: string
    name: string
    zone: string
  } | null
}) {
  return {
    id: detection.id,
    imagePath: detection.imagePath,
    species: detection.species,
    confidence: Math.round(detection.confidence),
    location: detection.location,
    priority: normalizePriority(detection.priority),
    cameraId: detection.cameraId,
    batchJobId: detection.batchJobId,
    camera: detection.camera ?? null,
    x1: detection.x1,
    y1: detection.y1,
    x2: detection.x2,
    y2: detection.y2,
    manualReviewedAt: detection.manualReviewedAt?.toISOString() ?? null,
    manualReviewNote: detection.manualReviewNote,
    userId: detection.userId,
    createdAt: detection.createdAt.toISOString(),
    capturedAt: detection.capturedAt?.toISOString() ?? null,
    captureDateSource: detection.captureDateSource,
    time: formatRelativeDate(detection.createdAt)
  }
}

function toPublicBatchJob(job: {
  id: number
  zipName: string
  status: string
  totalImages: number
  processedImages: number
  failedImages: number
  error: string | null
  cameraId: number | null
  createdAt: Date
  completedAt: Date | null
  camera: {
    id: number
    code: string
    name: string
    zone: string
  } | null
}) {
  const progress = getBatchProgress(job)

  return {
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    error: job.error,
    failedImages: job.failedImages,
    id: job.id,
    cameraId: job.cameraId,
    camera: job.camera,
    pendingImages: progress.pendingImages,
    percentage: progress.percentage,
    processedImages: job.processedImages,
    status: job.status,
    totalImages: job.totalImages,
    zipName: job.zipName
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  const batchId = await getBatchId(context)

  if (!batchId) {
    return NextResponse.json({ error: 'Lote invalido' }, { status: 400 })
  }

  const isAdmin = isAdminRole(currentUser.role)
  const jobWhere: Prisma.BatchJobWhereInput = { id: batchId }

  if (!isAdmin) {
    jobWhere.userId = currentUser.id
  }

  const job = await prisma.batchJob.findFirst({
    include: {
      camera: {
        select: {
          code: true,
          id: true,
          name: true,
          zone: true
        }
      }
    },
    where: jobWhere
  })

  if (!job) {
    return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })
  }

  const searchParams = request.nextUrl.searchParams
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get('pageSize') ?? '25') || 25))
  const species = searchParams.get('species')?.trim()
  const priority = searchParams.get('priority')?.trim()
  const review = searchParams.get('review')?.trim()
  const detectionState = searchParams.get('detection')?.trim()
  const minConfidence = Number(searchParams.get('minConfidence') ?? '')

  const where: Prisma.DetectionWhereInput = { batchJobId: batchId }

  if (!isAdmin) {
    where.userId = currentUser.id
  }

  if (species) {
    where.species = species
  }

  if (priority) {
    where.priority = priority
  }

  if (Number.isFinite(minConfidence) && minConfidence > 0) {
    where.confidence = { gte: minConfidence }
  }

  if (review === 'reviewed') {
    where.manualReviewedAt = { not: null }
  } else if (review === 'pending') {
    where.manualReviewedAt = null
  }

  if (detectionState === 'with') {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { species: { not: 'Sin deteccion' } },
      { confidence: { gt: 0 } }
    ]
  } else if (detectionState === 'without') {
    where.OR = [{ species: 'Sin deteccion' }, { confidence: { lte: 0 } }]
  }

  const baseWhere: Prisma.DetectionWhereInput = { batchJobId: batchId, ...(isAdmin ? {} : { userId: currentUser.id }) }
  const positiveWhere: Prisma.DetectionWhereInput = {
    ...baseWhere,
    species: { not: 'Sin deteccion' },
    confidence: { gt: 0 }
  }
  const withoutDetectionWhere: Prisma.DetectionWhereInput = {
    ...baseWhere,
    OR: [{ species: 'Sin deteccion' }, { confidence: { lte: 0 } }]
  }

  const [totalFiltered, detections, animalDetections, withoutDetection, speciesDistribution] = await Promise.all([
    prisma.detection.count({ where }),
    prisma.detection.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        imagePath: true,
        species: true,
        confidence: true,
        location: true,
        priority: true,
        cameraId: true,
        batchJobId: true,
        x1: true,
        y1: true,
        x2: true,
        y2: true,
        manualReviewedAt: true,
        manualReviewNote: true,
        createdAt: true,
        userId: true,
        camera: {
          select: {
            code: true,
            id: true,
            name: true,
            zone: true
          }
        }
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      where
    }),
    prisma.detection.count({ where: positiveWhere }),
    prisma.detection.count({ where: withoutDetectionWhere }),
    prisma.detection.groupBy({
      by: ['species'],
      _count: { species: true },
      orderBy: { _count: { species: 'desc' } },
      where: positiveWhere
    })
  ])

  const durationMs = job.completedAt ? job.completedAt.getTime() - job.createdAt.getTime() : null
  const progress = getBatchProgress(job)

  return NextResponse.json({
    job: toPublicBatchJob(job),
    progress: {
      id: job.id,
      zipName: job.zipName,
      status: job.status,
      totalImages: job.totalImages,
      processedImages: job.processedImages,
      failedImages: job.failedImages,
      pendingImages: progress.pendingImages,
      percentage: progress.percentage,
      detectionsFound: animalDetections,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null
    },
    summary: {
      batchId: job.id,
      zipName: job.zipName,
      status: job.status,
      totalImages: job.totalImages,
      processedImages: job.processedImages,
      failedImages: job.failedImages,
      pendingImages: progress.pendingImages,
      percentage: progress.percentage,
      detectionsFound: animalDetections,
      animalDetections,
      withoutDetection,
      distinctSpecies: speciesDistribution.length,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      durationMs,
      camera: job.camera,
      speciesDistribution: speciesDistribution.map((item) => ({
        species: item.species,
        count: item._count.species
      }))
    },
    detections: detections.map(toPublicDetection),
    pagination: {
      page,
      pageSize,
      total: totalFiltered,
      totalPages: Math.max(1, Math.ceil(totalFiltered / pageSize))
    }
  })
}
