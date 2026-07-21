import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { Prisma } from '@prisma/client'
import { seedDetectionsIfEmpty } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { toProtectedDetectionImagePath } from '@/lib/fileStorage'
import { calculatePriority, formatRelativeDate, normalizeSpecies } from '@/lib/detections'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { invalidSpeciesValues } from '@/lib/detectionClassification'
import { getManualReviewStatus, isManualReviewStatus } from '@/lib/manualReviewPolicy'
import { hasDetectionCaptureColumns } from '@/lib/detectionCaptureColumns'
import { forbiddenByCsrf, verifySameOrigin } from '@/lib/requestSecurity'

export const dynamic = 'force-dynamic'

type PublicDetectionInput = {
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
  manualReviewStatus?: string | null
  reviewedById?: number | null
  manualOriginalSpecies?: string | null
  manualCorrectedSpecies?: string | null
  reviewVersion?: number
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
  user?: {
    id: number
    name: string
    email: string
  } | null
  reviewedBy?: {
    id: number
    name: string
    email: string
  } | null
}

function toPublicDetection(detection: PublicDetectionInput) {
  return {
    id: detection.id,
    imagePath: toProtectedDetectionImagePath(detection.id),
    species: detection.species,
    confidence: Math.round(detection.confidence),
    location: detection.location,
    priority: detection.priority,
    cameraId: detection.cameraId,
    batchJobId: detection.batchJobId,
    camera: detection.camera ?? null,
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
    researcher: detection.user?.name ?? 'Sin investigador',
    researcherEmail: detection.user?.email ?? null,
    createdAt: detection.createdAt.toISOString(),
    capturedAt: detection.capturedAt?.toISOString() ?? null,
    captureDateSource: detection.captureDateSource ?? null,
    time: formatRelativeDate(detection.createdAt)
  }
}

const reviewerSelect = {
  select: {
    email: true,
    id: true,
    name: true
  }
} satisfies Prisma.UserDefaultArgs

function getDetectionSelect(hasCaptureColumns: boolean) {
  return {
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
    manualReviewStatus: true,
    reviewedById: true,
    manualOriginalSpecies: true,
    manualCorrectedSpecies: true,
    reviewVersion: true,
    createdAt: true,
    userId: true,
    ...(hasCaptureColumns ? { capturedAt: true, captureDateSource: true } : {}),
    camera: {
      select: {
        code: true,
        id: true,
        name: true,
        zone: true
      }
    },
    user: reviewerSelect,
    reviewedBy: reviewerSelect
  } satisfies Prisma.DetectionSelect
}

export async function GET(request: NextRequest) {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  await seedDetectionsIfEmpty()

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true }
  })

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion invalida' }, { status: 401 })
  }

  const hasCaptureColumns = await hasDetectionCaptureColumns()
  const searchParams = request.nextUrl.searchParams
  const speciesFilter = searchParams.get('species')?.trim()
  const dateFilter = searchParams.get('date')?.trim()
  const researcherFilter = Number(searchParams.get('researcherId') ?? '')
  const cameraFilter = Number(searchParams.get('cameraId') ?? '')
  const batchJobFilter = Number(searchParams.get('batchJobId') ?? '')
  const legacyLimit = Number(searchParams.get('limit') ?? '')
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
  const requestedPageSize = Number(searchParams.get('pageSize') ?? '') || (Number.isFinite(legacyLimit) && legacyLimit > 0 ? legacyLimit : 20)
  const pageSize = Math.min(100, Math.max(10, requestedPageSize))
  const isAdmin = isAdminRole(currentUser.role)
  const where: Prisma.DetectionWhereInput = isAdmin ? {} : { userId: currentUser.id }

  if (isAdmin && Number.isInteger(researcherFilter) && researcherFilter > 0) {
    where.userId = researcherFilter
  }

  if (Number.isInteger(cameraFilter) && cameraFilter > 0) {
    where.cameraId = cameraFilter
  }

  if (Number.isInteger(batchJobFilter) && batchJobFilter > 0) {
    where.batchJobId = batchJobFilter
  }

  if (speciesFilter) {
    where.species = speciesFilter
  }

  if (dateFilter) {
    const start = new Date(`${dateFilter}T00:00:00`)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    where.createdAt = { gte: start, lt: end }
  }

  const speciesOptionsWhere: Prisma.DetectionWhereInput = isAdmin ? {} : { userId: currentUser.id }

  if (isAdmin && Number.isInteger(researcherFilter) && researcherFilter > 0) {
    speciesOptionsWhere.userId = researcherFilter
  }

  if (Number.isInteger(cameraFilter) && cameraFilter > 0) {
    speciesOptionsWhere.cameraId = cameraFilter
  }

  if (Number.isInteger(batchJobFilter) && batchJobFilter > 0) {
    speciesOptionsWhere.batchJobId = batchJobFilter
  }

  const detectionSelect = getDetectionSelect(hasCaptureColumns)
  const [totalFiltered, detections, availableSpeciesRows] = await Promise.all([
    prisma.detection.count({ where }),
    prisma.detection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: detectionSelect,
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.detection.groupBy({
      by: ['species'],
      orderBy: { species: 'asc' },
      where: speciesOptionsWhere
    })
  ])

  const positiveWhere: Prisma.DetectionWhereInput = {
    ...where,
    species: { notIn: invalidSpeciesValues },
    confidence: { gt: 0 }
  }

  const total = totalFiltered
  const totalDetections = await prisma.detection.count({ where: positiveWhere })
  const species = await prisma.detection.groupBy({ by: ['species'], where: positiveWhere })
  const confidence = await prisma.detection.aggregate({ _avg: { confidence: true }, where: positiveWhere })

  return NextResponse.json({
    currentUser: {
      id: currentUser.id,
      role: currentUser.role
    },
    metrics: [
      {
        label: 'Total de imagenes analizadas',
        value: total.toLocaleString('es-ES'),
        detail: 'Total de registros procesados'
      },
      {
        label: 'Total de detecciones',
        value: totalDetections.toLocaleString('es-ES'),
        detail: 'Imagenes con animal detectado'
      },
      {
        label: 'Especies detectadas',
        value: species.length.toString(),
        detail: 'Especies distintas detectadas'
      },
      {
        label: 'Confianza promedio',
        value: `${Math.round(confidence._avg.confidence ?? 0)}%`,
        detail: 'Promedio de confianza YOLO'
      }
    ],
    detections: detections.map(toPublicDetection),
    availableSpecies: availableSpeciesRows.map((item) => item.species).filter(Boolean),
    pagination: {
      page,
      pageSize,
      total: totalFiltered,
      totalPages: Math.max(1, Math.ceil(totalFiltered / pageSize))
    }
  })
}

export async function PATCH(request: NextRequest) {
  if (!verifySameOrigin(request)) return forbiddenByCsrf()

  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  await seedDetectionsIfEmpty()

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true }
  })

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion invalida' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    detectionId?: number
    note?: string
    species?: string
    reviewVersion?: number
    manualReviewStatus?: string
  } | null
  const detectionId = Number(body?.detectionId)
  const reviewedSpecies = body?.species?.trim()

  if (!Number.isInteger(detectionId) || detectionId <= 0) {
    return NextResponse.json({ error: 'Detection id invalido' }, { status: 400 })
  }

  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    select: {
      confidence: true,
      id: true,
      manualOriginalSpecies: true,
      priority: true,
      reviewVersion: true,
      species: true,
      userId: true
    }
  })

  if (!detection) {
    return NextResponse.json({ error: 'Deteccion no encontrada' }, { status: 404 })
  }

  if (!isAdminRole(currentUser.role) && detection.userId !== currentUser.id) {
    return NextResponse.json({ error: 'No autorizado para revisar esta deteccion' }, { status: 403 })
  }

  if (detection.priority !== 'Revision manual') {
    return NextResponse.json({ error: 'Esta deteccion no requiere revision manual' }, { status: 400 })
  }

  if (!reviewedSpecies) {
    return NextResponse.json({ error: 'La especie revisada es requerida' }, { status: 400 })
  }

  if (typeof body?.reviewVersion === 'number' && body.reviewVersion !== detection.reviewVersion) {
    return NextResponse.json(
      { error: 'Esta revision fue modificada por otro investigador.', code: 'REVIEW_CONFLICT' },
      { status: 409 }
    )
  }

  if (body?.manualReviewStatus && !isManualReviewStatus(body.manualReviewStatus)) {
    return NextResponse.json({ error: 'Estado de revision invalido' }, { status: 400 })
  }

  const normalizedReviewedSpecies = normalizeSpecies(reviewedSpecies)
  const reviewedPriority =
    normalizedReviewedSpecies === 'sin deteccion' || normalizedReviewedSpecies === 'imagen no evaluable'
      ? 'Revision manual'
      : calculatePriority(reviewedSpecies, Math.max(detection.confidence, 1))
  const manualReviewStatus = getManualReviewStatus({
    explicitStatus: body?.manualReviewStatus,
    originalSpecies: detection.manualOriginalSpecies ?? detection.species,
    reviewedSpecies
  })

  const hasCaptureColumns = await hasDetectionCaptureColumns()
  const updatedDetection = await prisma.detection.update({
    where: { id: detectionId },
    data: {
      manualReviewNote: body?.note?.trim() || null,
      manualReviewedAt: new Date(),
      manualReviewStatus,
      manualOriginalSpecies: detection.manualOriginalSpecies ?? detection.species,
      manualCorrectedSpecies: reviewedSpecies,
      reviewedById: currentUser.id,
      reviewVersion: { increment: 1 },
      priority: reviewedPriority,
      species: reviewedSpecies
    },
    select: getDetectionSelect(hasCaptureColumns)
  })

  return NextResponse.json({ detection: toPublicDetection(updatedDetection) })
}