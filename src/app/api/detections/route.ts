import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { Prisma } from '@prisma/client'
import { seedDetectionsIfEmpty } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { calculatePriority, formatRelativeDate, normalizeSpecies } from '@/lib/detections'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

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
}) {
  return {
    id: detection.id,
    imagePath: detection.imagePath,
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
    userId: detection.userId,
    researcher: detection.user?.name ?? 'Sin investigador',
    researcherEmail: detection.user?.email ?? null,
    createdAt: detection.createdAt.toISOString(),
    time: formatRelativeDate(detection.createdAt)
  }
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

  const searchParams = request.nextUrl.searchParams
  const speciesFilter = searchParams.get('species')?.trim()
  const dateFilter = searchParams.get('date')?.trim()
  const researcherFilter = Number(searchParams.get('researcherId') ?? '')
  const cameraFilter = Number(searchParams.get('cameraId') ?? '')
  const batchJobFilter = Number(searchParams.get('batchJobId') ?? '')
  const limit = searchParams.get('limit')
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

  const detections = await prisma.detection.findMany({
    where,
    include: {
      camera: {
        select: {
          code: true,
          id: true,
          name: true,
          zone: true
        }
      },
      user: {
        select: {
          email: true,
          id: true,
          name: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    ...(limit === 'all' ? {} : { take: 20 })
  })

  const positiveWhere: Prisma.DetectionWhereInput = {
    ...where,
    species: { not: 'Sin deteccion' },
    confidence: { gt: 0 }
  }

  const speciesWhere: Prisma.DetectionWhereInput = {
    ...where,
    species: { not: 'Sin deteccion' }
  }

  const total = await prisma.detection.count({ where })
  const totalDetections = await prisma.detection.count({
    where: positiveWhere
  })
  const species = await prisma.detection.groupBy({
    by: ['species'],
    where: speciesWhere
  })
  const confidence = await prisma.detection.aggregate({
    _avg: { confidence: true },
    where: positiveWhere
  })

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
    detections: detections.map(toPublicDetection)
  })
}

export async function PATCH(request: NextRequest) {
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

  const body = (await request.json().catch(() => null)) as { detectionId?: number; note?: string; species?: string } | null
  const detectionId = Number(body?.detectionId)
  const reviewedSpecies = body?.species?.trim()

  if (!Number.isInteger(detectionId) || detectionId <= 0) {
    return NextResponse.json({ error: 'Detection id invalido' }, { status: 400 })
  }

  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    select: { confidence: true, id: true, priority: true, species: true, userId: true }
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

  const normalizedReviewedSpecies = normalizeSpecies(reviewedSpecies)
  const reviewedPriority =
    normalizedReviewedSpecies === 'sin deteccion'
      ? 'Revision manual'
      : calculatePriority(reviewedSpecies, Math.max(detection.confidence, 1))

  const updatedDetection = await prisma.detection.update({
    where: { id: detectionId },
    data: {
      manualReviewNote: body?.note?.trim() || null,
      manualReviewedAt: new Date(),
      priority: reviewedPriority,
      species: reviewedSpecies
    },
    include: {
      camera: {
        select: {
          code: true,
          id: true,
          name: true,
          zone: true
        }
      },
      user: {
        select: {
          email: true,
          id: true,
          name: true
        }
      }
    }
  })

  return NextResponse.json({ detection: toPublicDetection(updatedDetection) })
}
