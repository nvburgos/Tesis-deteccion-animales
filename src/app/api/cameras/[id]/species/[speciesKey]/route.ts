import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { toProtectedDetectionImagePath } from '@/lib/fileStorage'
import { formatRelativeDate } from '@/lib/detections'
import { getSpeciesLabel } from '@/lib/i18n'
import { getTaxonomicGroup } from '@/lib/speciesTaxonomy'
import { isValidSpecies } from '@/lib/detectionClassification'
import { hasDetectionCaptureColumns } from '@/lib/detectionCaptureColumns'

export const dynamic = 'force-dynamic'

const ranges = ['00:00-03:00', '03:00-06:00', '06:00-09:00', '09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00', '21:00-00:00']

async function getCurrentUser() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) return null

  await ensureDatabase()
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
}

async function getParams(context: { params: Promise<{ id: string; speciesKey: string }> }) {
  const { id, speciesKey } = await context.params
  const cameraId = Number(id)

  if (!Number.isInteger(cameraId) || cameraId <= 0) return null

  return { cameraId, species: decodeURIComponent(speciesKey) }
}

function normalizePriority(priority: string) {
  if (priority === 'Alta') return 'Alta prioridad'
  if (priority === 'RevisiÃƒÆ’Ã‚Â³n manual') return 'Revision manual'
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
  camera?: { id: number; code: string; name: string; zone: string } | null
  reviewedBy?: { id: number; name: string; email: string } | null
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
    captureDateSource: detection.captureDateSource ?? null,
    time: formatRelativeDate(detection.createdAt)
  }
}

function getRange(value: Date) {
  return ranges[Math.floor(value.getHours() / 3)] ?? ranges[0]
}

function getPeakRange(values: Date[]) {
  if (values.length === 0) return 'Sin datos'
  const counts = new Map<string, number>()
  values.forEach((value) => {
    const range = getRange(value)
    counts.set(range, (counts.get(range) ?? 0) + 1)
  })
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'Sin datos'
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; speciesKey: string }> }) {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
      return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
    }

    const params = await getParams(context)

    if (!params) {
      return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 })
    }

    if (!isValidSpecies(params.species)) {
      return NextResponse.json({ error: 'Especie invalida para analisis' }, { status: 400 })
    }

    const camera = await prisma.camera.findFirst({ where: { id: params.cameraId, active: true }, select: { code: true, id: true, name: true, zone: true } })

    if (!camera) {
      return NextResponse.json({ error: 'Camara no encontrada' }, { status: 404 })
    }

    const hasCaptureColumns = await hasDetectionCaptureColumns()
    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(30, Math.max(6, Number(searchParams.get('pageSize') ?? '12') || 12))
    const where: Prisma.DetectionWhereInput = {
      cameraId: params.cameraId,
      confidence: { gt: 0 },
      species: params.species
    }

    if (!isAdminRole(currentUser.role)) {
      where.userId = currentUser.id
    }

    const [total, allRecords, detections] = await Promise.all([
      prisma.detection.count({ where }),
      prisma.detection.findMany({
        orderBy: hasCaptureColumns ? [{ capturedAt: 'asc' }, { createdAt: 'asc' }] : { createdAt: 'asc' },
        select: { confidence: true, createdAt: true, manualReviewedAt: true, ...(hasCaptureColumns ? { capturedAt: true } : {}) },
        where
      }),
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
          ...(hasCaptureColumns ? { capturedAt: true, captureDateSource: true } : {}),
          camera: { select: { code: true, id: true, name: true, zone: true } },
          reviewedBy: { select: { email: true, id: true, name: true } }
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where
      })
    ])

    const recordsWithCaptureDate = allRecords.filter((record) => Boolean((record as { capturedAt?: Date | null }).capturedAt))
    const timestamps = recordsWithCaptureDate.map((record) => (record as { capturedAt?: Date | null }).capturedAt as Date)
    const averageConfidence = allRecords.reduce((sum, record) => sum + record.confidence, 0) / Math.max(1, allRecords.length)
    const dailyCounts = new Map<string, number>()
    const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
    const rangeActivity = ranges.map((range) => ({ range, count: 0 }))

    recordsWithCaptureDate.forEach((record) => {
      const capturedAt = (record as { capturedAt?: Date | null }).capturedAt as Date
      const hour = capturedAt.getHours()
      hourlyActivity[hour].count += 1
      const range = getRange(capturedAt)
      const rangeItem = rangeActivity.find((item) => item.range === range)
      if (rangeItem) rangeItem.count += 1
      const dateKey = toDateKey(capturedAt)
      dailyCounts.set(dateKey, (dailyCounts.get(dateKey) ?? 0) + 1)
    })

    const dailyActivity = [...dailyCounts.entries()].map(([date, count]) => ({ date, count }))
    const topCaptureDay = [...dailyActivity].sort((left, right) => right.count - left.count)[0] ?? null
    const peakActivityRange = getPeakRange(timestamps)
    const recordsWithoutCaptureDate = Math.max(0, total - recordsWithCaptureDate.length)

    return NextResponse.json({
      camera,
      species: {
        name: getSpeciesLabel(params.species, 'es'),
        rawSpecies: params.species,
        taxonomicGroup: getTaxonomicGroup(params.species),
        records: total,
        recordsWithCaptureDate: recordsWithCaptureDate.length,
        recordsWithoutCaptureDate,
        averageConfidence,
        firstDetectedAt: timestamps[0]?.toISOString() ?? null,
        lastDetectedAt: timestamps[timestamps.length - 1]?.toISOString() ?? null,
        peakActivityRange,
        topCaptureDay,
        topProcessingDay: topCaptureDay,
        pendingReviews: allRecords.filter((record) => !record.manualReviewedAt).length
      },
      hourlyActivity,
      rangeActivity,
      dailyActivity,
      activityConclusion: peakActivityRange === 'Sin datos' ? 'No hay fechas de captura suficientes para esta especie.' : `Esta especie presento mayor actividad entre las ${peakActivityRange}.`,
      detections: detections.map(toPublicDetection),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      timeSource: 'capturedAt',
      timeSourceLabel: 'Fecha de captura',
      limitation: `${total.toLocaleString('es-ES')} registros totales; ${recordsWithCaptureDate.length.toLocaleString('es-ES')} con fecha de captura disponible. Los registros sin fecha de captura se excluyen de los graficos temporales.`
    })
  } catch (error) {
    console.error('GET /api/cameras/[id]/species/[speciesKey] error:', error)
    return NextResponse.json({ error: 'No se pudo cargar el detalle de especie' }, { status: 500 })
  }
}

