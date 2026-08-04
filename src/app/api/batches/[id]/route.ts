import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { formatRelativeDate } from '@/lib/detections'
import { calculateBatchProgress } from '@/lib/batchProgress'
import { invalidSpeciesValues, isValidSpecies } from '@/lib/detectionClassification'
import { getIdentificationLevel } from '@/lib/speciesTaxonomy'

export const dynamic = 'force-dynamic'

const manualReviewPriorityValues = ['Revision manual', 'Revisi?n manual', 'REVISION MANUAL', 'Manual review']
const terminalReviewStatuses = ['Confirmada', 'Corregida', 'Sin fauna', 'No evaluable', 'Descartada']

function toProtectedDetectionImagePath(detectionId: number) {
  return `/api/files/${detectionId}`
}

function appendWhereAnd(where: Prisma.DetectionWhereInput, condition: Prisma.DetectionWhereInput) {
  where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), condition]
}

function pendingManualReviewCondition(): Prisma.DetectionWhereInput {
  return {
    OR: [
      { manualReviewStatus: 'Pendiente' },
      {
        AND: [
          { manualReviewStatus: null },
          { manualReviewedAt: null },
          {
            OR: [
              { priority: { in: manualReviewPriorityValues } },
              { species: { in: invalidSpeciesValues } },
              { confidence: { lte: 0 } }
            ]
          }
        ]
      }
    ]
  }
}

function reviewedManualReviewCondition(): Prisma.DetectionWhereInput {
  return { OR: [{ manualReviewedAt: { not: null } }, { manualReviewStatus: { in: terminalReviewStatuses } }] }
}

function getStorageRoot() {
  return path.resolve(process.env.STORAGE_ROOT || 'storage')
}

function readBatchProgressState(batchId: number) {
  const statePath = path.join(getStorageRoot(), 'uploads', 'batches', String(batchId), '.progress.json')
  if (!existsSync(statePath)) {
    return null
  }

  try {
    return JSON.parse(readFileSync(statePath, 'utf8')) as {
      stage?: string
      pythonStage?: string
      updatedAt?: string
      modelLoadSeconds?: number
    }
  } catch (error) {
    console.error('No se pudo leer el estado de progreso del lote:', error)
    return null
  }
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

  if (priority === 'Revision manual' || priority === 'Revisión manual') {
    return 'Revision manual'
  }

  return priority
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
  individualId?: number | null
  individualMatchStatus?: string | null
  individualMatchConfidence?: number | null
  individualMatchBasis?: string | null
  x1: number | null
  y1: number | null
  x2: number | null
  y2: number | null
  manualReviewedAt: Date | null
  manualReviewNote: string | null
  manualReviewStatus?: string | null
  reviewedById?: number | null
  manualOriginalSpecies?: string | null
  manualCorrectedSpecies?: string | null
  reviewVersion?: number
  createdAt: Date
  capturedAt?: Date | null
  captureDateSource?: string | null
  cameraTrapCode?: string | null
  temperatureCelsius?: number | null
  temperatureFahrenheit?: number | null
  visibleMetadataText?: string | null
  userId: number | null
  camera?: {
    id: number
    code: string
    name: string
    zone: string
  } | null
  individual?: {
    id: number
    species: string
    label: string | null
  } | null
  reviewedBy?: {
    id: number
    name: string
    email: string
  } | null
}) {
  return {
    id: detection.id,
    imagePath: toProtectedDetectionImagePath(detection.id),
    species: detection.species,
    confidence: Math.round(detection.confidence),
    location: detection.location,
    priority: normalizePriority(detection.priority),
    cameraId: detection.cameraId,
    batchJobId: detection.batchJobId,
    camera: detection.camera ?? null,
    individualId: detection.individualId ?? null,
    individualMatchStatus: detection.individualMatchStatus ?? null,
    individualMatchConfidence: detection.individualMatchConfidence ?? null,
    individualMatchBasis: detection.individualMatchBasis ?? null,
    individual: detection.individual ?? null,
    x1: detection.x1,
    y1: detection.y1,
    x2: detection.x2,
    y2: detection.y2,
    manualReviewedAt: detection.manualReviewedAt?.toISOString() ?? null,
    manualReviewNote: detection.manualReviewNote,
    manualReviewStatus: detection.manualReviewStatus ?? null,
    reviewedById: detection.reviewedById ?? null,
    reviewedBy: detection.reviewedBy ?? null,
    manualOriginalSpecies: detection.manualOriginalSpecies ?? null,
    manualCorrectedSpecies: detection.manualCorrectedSpecies ?? null,
    reviewVersion: detection.reviewVersion ?? 0,
    userId: detection.userId,
    createdAt: detection.createdAt.toISOString(),
    capturedAt: detection.capturedAt?.toISOString() ?? null,
    captureDateSource: detection.captureDateSource,
    cameraTrapCode: detection.cameraTrapCode ?? null,
    temperatureCelsius: detection.temperatureCelsius ?? null,
    temperatureFahrenheit: detection.temperatureFahrenheit ?? null,
    visibleMetadataText: detection.visibleMetadataText ?? null,
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
  startedAt?: Date | null
  heartbeatAt?: Date | null
  workerId?: string | null
  attempts?: number
  lastError?: string | null
  nextRetryAt?: Date | null
  cancelRequestedAt?: Date | null
  camera: {
    id: number
    code: string
    name: string
    zone: string
  } | null
}) {
  const progress = calculateBatchProgress(job)

  return {
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    error: job.error,
    startedAt: job.startedAt?.toISOString() ?? null,
    heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
    workerId: job.workerId ?? null,
    attempts: job.attempts ?? 0,
    lastError: job.lastError ?? null,
    nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
    cancelRequestedAt: job.cancelRequestedAt?.toISOString() ?? null,
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
    appendWhereAnd(where, reviewedManualReviewCondition())
  } else if (review === 'pending') {
    appendWhereAnd(where, pendingManualReviewCondition())
  }

  if (detectionState === 'with') {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { species: { notIn: invalidSpeciesValues } },
      { confidence: { gt: 0 } }
    ]
  } else if (detectionState === 'without') {
    where.OR = [{ species: { in: invalidSpeciesValues } }, { confidence: { lte: 0 } }]
  }

  const baseWhere: Prisma.DetectionWhereInput = { batchJobId: batchId, ...(isAdmin ? {} : { userId: currentUser.id }) }
  const positiveWhere: Prisma.DetectionWhereInput = {
    ...baseWhere,
    confidence: { gt: 0 },
    species: { notIn: invalidSpeciesValues }
  }
  const withoutWhere: Prisma.DetectionWhereInput = {
    ...baseWhere,
    OR: [{ species: { in: invalidSpeciesValues } }, { confidence: { lte: 0 } }]
  }

  const [_positiveDetectionCount, _withoutDetectionCount, speciesDistributionRows, totalFiltered, detections] = await Promise.all([
    prisma.detection.count({ where: positiveWhere }),
    prisma.detection.count({ where: withoutWhere }),
    prisma.detection.groupBy({
      by: ['species'],
      _count: { _all: true },
      orderBy: { _count: { species: 'desc' } },
      where: positiveWhere
    }),
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
        individualId: true,
        individualMatchStatus: true,
        individualMatchConfidence: true,
        individualMatchBasis: true,
        x1: true,
        y1: true,
        x2: true,
        y2: true,
        manualReviewedAt: true,
        manualReviewNote: true,
        manualReviewStatus: true,
        reviewedById: true,
        manualOriginalSpecies: true,
        manualCorrectedSpecies: true,
        reviewVersion: true,
        createdAt: true,
        userId: true,
        cameraTrapCode: true,
        temperatureCelsius: true,
        temperatureFahrenheit: true,
        visibleMetadataText: true,
        camera: {
          select: {
            code: true,
            id: true,
            name: true,
            zone: true
          }
        },
        individual: {
          select: {
            id: true,
            label: true,
            species: true
          }
        },
        reviewedBy: {
          select: {
            email: true,
            id: true,
            name: true
          }
        }
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      where
    })
  ])

  const speciesDistribution = speciesDistributionRows
    .filter((item) => item.species && isValidSpecies(item.species))
    .map((item) => ({
      species: item.species as string,
      count: item._count._all,
      classificationLevel: getIdentificationLevel(item.species)
    }))

  const validAnimalDetections = speciesDistribution.reduce((sum, item) => sum + item.count, 0)
  const validWithoutDetection = Math.max(0, job.processedImages - job.failedImages - validAnimalDetections)
  const speciesDistributionWithPercentages = speciesDistribution.map((item) => ({
    ...item,
    percentage: validAnimalDetections > 0 ? Number(((item.count / validAnimalDetections) * 100).toFixed(1)) : 0
  }))

  const durationMs = job.completedAt ? job.completedAt.getTime() - job.createdAt.getTime() : null
  const progress = calculateBatchProgress(job)
  const progressState = readBatchProgressState(job.id)
  const stage = job.status === 'Procesando' && progressState?.stage ? progressState.stage : progress.stage

  return NextResponse.json({
    job: toPublicBatchJob(job),
    progress: {
      id: job.id,
      zipName: job.zipName,
      status: job.status,
      stage,
      stageUpdatedAt: progressState?.updatedAt ?? null,
      pythonStage: progressState?.pythonStage ?? null,
      startedAt: job.startedAt?.toISOString() ?? null,
      heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
      attempts: job.attempts ?? 0,
      lastError: job.lastError ?? null,
      nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
      totalImages: job.totalImages,
      processedImages: job.processedImages,
      failedImages: job.failedImages,
      completedImages: progress.completedImages,
      pendingImages: progress.pendingImages,
      percentage: progress.percentage,
      detectionsFound: validAnimalDetections,
      withoutDetection: validWithoutDetection,
      elapsedSeconds: progress.elapsedSeconds,
      queueSeconds: progress.queueSeconds,
      imagesPerMinute: progress.imagesPerMinute,
      averageSecondsPerImage: progress.averageSecondsPerImage,
      estimatedRemainingSeconds: progress.estimatedRemainingSeconds,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null
    },
    summary: {
      batchId: job.id,
      zipName: job.zipName,
      status: job.status,
      startedAt: job.startedAt?.toISOString() ?? null,
      heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
      attempts: job.attempts ?? 0,
      lastError: job.lastError ?? null,
      nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
      totalImages: job.totalImages,
      processedImages: job.processedImages,
      failedImages: job.failedImages,
      completedImages: progress.completedImages,
      pendingImages: progress.pendingImages,
      percentage: progress.percentage,
      stage,
      stageUpdatedAt: progressState?.updatedAt ?? null,
      pythonStage: progressState?.pythonStage ?? null,
      detectionsFound: validAnimalDetections,
      animalDetections: validAnimalDetections,
      withoutDetection: validWithoutDetection,
      elapsedSeconds: progress.elapsedSeconds,
      queueSeconds: progress.queueSeconds,
      imagesPerMinute: progress.imagesPerMinute,
      averageSecondsPerImage: progress.averageSecondsPerImage,
      estimatedRemainingSeconds: progress.estimatedRemainingSeconds,
      distinctSpecies: speciesDistributionWithPercentages.length,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      durationMs,
      camera: job.camera,
      speciesDistribution: speciesDistributionWithPercentages
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



