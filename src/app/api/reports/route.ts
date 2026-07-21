import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { hasDetectionCaptureColumns } from '@/lib/detectionCaptureColumns'
import { prisma } from '@/lib/prisma'
import { invalidSpeciesValues, isPositiveFaunaDetection, isValidSpecies, isWithoutDetectionResult } from '@/lib/detectionClassification'
import { isPendingManualReview } from '@/lib/manualReviewPolicy'
import { getTaxonomicGroup, normalizeTaxonomyKey, type TaxonomicGroup } from '@/lib/speciesTaxonomy'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

const periodLabels: Record<string, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  '7d': 'Ultimos 7 dias',
  '30d': 'Ultimos 30 dias',
  '90d': 'Ultimos 90 dias',
  month: 'Este mes',
  year: 'Este anio',
  all: 'Todo el historial',
  custom: 'Periodo personalizado'
}

const hourRanges = [
  '00:00-03:00',
  '03:00-06:00',
  '06:00-09:00',
  '09:00-12:00',
  '12:00-15:00',
  '15:00-18:00',
  '18:00-21:00',
  '21:00-00:00'
]

const excludedSpecies = new Set(invalidSpeciesValues.map((species) => normalizeTaxonomyKey(species)))

function parseIds(value: string | null) {
  return value ? value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0) : []
}

function parseList(value: string | null) {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getPeriodRange(period: string, from?: string | null, to?: string | null) {
  const now = new Date()
  const today = startOfDay(now)

  if (period === 'all') return { start: null, end: null }
  if (period === 'today') return { start: today, end: addDays(today, 1) }
  if (period === 'yesterday') return { start: addDays(today, -1), end: today }
  if (period === '7d' || period === '30d' || period === '90d') return { start: addDays(today, -Number(period.replace('d', ''))), end: addDays(today, 1) }
  if (period === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: addDays(today, 1) }
  if (period === 'year') return { start: new Date(now.getFullYear(), 0, 1), end: addDays(today, 1) }
  if (period === 'custom' && from && to) return { start: new Date(`${from}T00:00:00`), end: addDays(new Date(`${to}T00:00:00`), 1) }

  return { start: addDays(today, -30), end: addDays(today, 1) }
}

function inRange(date: Date | null | undefined, start: Date | null, end: Date | null) {
  if (!start || !end) return true
  if (!date) return true
  return date >= start && date < end
}

function inStrictRange(date: Date | null | undefined, start: Date | null, end: Date | null) {
  if (!start || !end) return true
  if (!date) return false
  return date >= start && date < end
}

function hourRange(date: Date) {
  return hourRanges[Math.floor(date.getHours() / 3)] ?? 'Sin fecha'
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toPercent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function topEntry(map: Map<string, number>) {
  return Array.from(map.entries()).sort((left, right) => right[1] - left[1])[0] ?? null
}

function isExcludedSpecies(species: string | null | undefined) {
  return !isValidSpecies(species) || excludedSpecies.has(normalizeTaxonomyKey(species))
}


function reviewStatusMatches(detection: { manualReviewStatus?: string | null; manualReviewedAt: Date | null; priority: string }, status: string) {
  if (!status || status === 'all') return true
  if (status === 'pending') return isPendingManualReview(detection)
  if (status === 'reviewed') return Boolean(detection.manualReviewedAt) || Boolean(detection.manualReviewStatus && detection.manualReviewStatus !== 'Pendiente')
  if (status === 'unreviewed') return !detection.manualReviewedAt && !detection.manualReviewStatus
  return true
}

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit('reports:' + getClientIp(request), 120, 15 * 60 * 1000)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 })

  try {
    const session = (await cookies()).get(AUTH_COOKIE)?.value
    const userId = getSessionUserId(session)

    if (!userId) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })

    await ensureDatabase()

    const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
    if (!currentUser) return NextResponse.json({ error: 'Sesion invalida' }, { status: 401 })

    const params = request.nextUrl.searchParams
    const cameraIds = parseIds(params.get('cameraIds'))
    const speciesFilter = parseList(params.get('species'))
    const priorities = parseList(params.get('priorities'))
    const taxonomyGroups = parseList(params.get('taxonomyGroups') ?? params.get('taxonomicGroups')) as TaxonomicGroup[]
    const reviewStatus = params.get('reviewStatus') ?? 'all'
    const minConfidence = Number(params.get('minConfidence') ?? 0)
    const period = params.get('period') ?? 'all'
    const dateFrom = params.get('dateFrom') ?? params.get('from')
    const dateTo = params.get('dateTo') ?? params.get('to')
    const { start, end } = getPeriodRange(period, dateFrom, dateTo)
    const hasCaptureColumns = await hasDetectionCaptureColumns()
    const isAdmin = isAdminRole(currentUser.role)

    const baseDetectionWhere: Prisma.DetectionWhereInput = isAdmin ? {} : { userId: currentUser.id }
    if (cameraIds.length > 0) baseDetectionWhere.cameraId = { in: cameraIds }
    if (speciesFilter.length > 0) baseDetectionWhere.species = { in: speciesFilter }
    if (priorities.length > 0) baseDetectionWhere.priority = { in: priorities }
    if (Number.isFinite(minConfidence) && minConfidence > 0) baseDetectionWhere.confidence = { gte: minConfidence }

    const allCameras = await prisma.camera.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: { code: true, id: true, name: true, zone: true }
    })

    const _totalBeforeFilters = await prisma.detection.count({ where: isAdmin ? {} : { userId: currentUser.id } })
    const detections = await prisma.detection.findMany({
      where: baseDetectionWhere,
      orderBy: hasCaptureColumns ? [{ capturedAt: 'asc' }, { createdAt: 'asc' }] : { createdAt: 'asc' },
      select: {
        id: true,
        species: true,
        confidence: true,
        priority: true,
        createdAt: true,
        manualReviewedAt: true,
        manualReviewStatus: true,
        cameraId: true,
        ...(hasCaptureColumns ? { capturedAt: true, captureDateSource: true } : {}),
        camera: { select: { code: true, id: true, name: true, zone: true } }
      }
    })

    const filteredDetections = detections
      .filter((detection) => {
        const captureDate = hasCaptureColumns ? (detection.capturedAt ?? null) : null
        return inRange(captureDate, start, end)
      })
      .filter((detection) => taxonomyGroups.length === 0 || taxonomyGroups.includes(getTaxonomicGroup(detection.species)))
      .filter((detection) => reviewStatusMatches(detection, reviewStatus))

    const includedSpecies = new Set<string>()
    const excludedSpeciesLog = new Set<string>()
    const positiveDetections = filteredDetections.filter((detection) => {
      const included = isPositiveFaunaDetection(detection.species, detection.confidence)
      if (included) includedSpecies.add(detection.species)
      else excludedSpeciesLog.add(detection.species ?? 'null')
      return included
    })
    const withoutDetection = filteredDetections.filter((detection) => isWithoutDetectionResult(detection.species, detection.confidence)).length
    const recordsWithoutCaptureDate = filteredDetections.filter((detection) => !('capturedAt' in detection) || !detection.capturedAt).length
    const temporalPositiveDetections = positiveDetections.filter((detection) => 'capturedAt' in detection && detection.capturedAt && inStrictRange(detection.capturedAt, start, end))

    const batchWhere: Prisma.BatchJobWhereInput = isAdmin ? {} : { userId: currentUser.id }
    if (cameraIds.length > 0) batchWhere.cameraId = { in: cameraIds }
    if (start && end) batchWhere.OR = [{ completedAt: { gte: start, lt: end } }, { completedAt: null, createdAt: { gte: start, lt: end } }]

    const batchSummary = await prisma.batchJob.aggregate({
      _sum: { processedImages: true, totalImages: true },
      where: { ...batchWhere, status: 'Completado' }
    })

    const groupsMap = new Map<string, number>()
    const speciesMap = new Map<string, number>()
    const camerasMap = new Map<string, number>()
    const priorityMap = new Map<string, number>()
    const hourlyMap = new Map<string, number>()
    const dailyMap = new Map<string, number>()
    const heatmapMap = new Map<string, number>()
    const speciesStats = new Map<string, { cameras: Set<string>; confidenceSum: number; count: number; firstCapture: Date | null; group: string; hourly: Map<string, number>; lastCapture: Date | null; species: string }>()

    for (const detection of filteredDetections) increment(priorityMap, detection.priority)

    for (const detection of positiveDetections) {
      const captureDate = 'capturedAt' in detection ? detection.capturedAt : null
      const group = getTaxonomicGroup(detection.species)
      const cameraLabel = detection.camera ? `${detection.camera.code} ${detection.camera.zone}` : 'Sin camara'
      increment(groupsMap, group)
      increment(speciesMap, detection.species)
      increment(camerasMap, cameraLabel)

      const existing = speciesStats.get(detection.species) ?? { cameras: new Set<string>(), confidenceSum: 0, count: 0, firstCapture: null, group, hourly: new Map<string, number>(), lastCapture: null, species: detection.species }
      existing.count += 1
      existing.confidenceSum += detection.confidence
      existing.cameras.add(cameraLabel)

      if (captureDate) {
        const range = hourRange(captureDate)
        increment(existing.hourly, range)
        existing.firstCapture = !existing.firstCapture || captureDate < existing.firstCapture ? captureDate : existing.firstCapture
        existing.lastCapture = !existing.lastCapture || captureDate > existing.lastCapture ? captureDate : existing.lastCapture
      }

      speciesStats.set(detection.species, existing)
    }

    for (const detection of temporalPositiveDetections) {
      const captureDate = detection.capturedAt
      if (!captureDate) continue
      increment(hourlyMap, hourRange(captureDate))
      increment(dailyMap, dateKey(captureDate))
      increment(heatmapMap, `${captureDate.getDay()}-${captureDate.getHours()}`)
    }

    const totalPositive = positiveDetections.length
    const topGroup = topEntry(groupsMap)
    const topSpecies = topEntry(speciesMap)
    const topCamera = topEntry(camerasMap)
    const topHour = topEntry(hourlyMap)
    const pendingReviews = filteredDetections.filter(isPendingManualReview).length
    const highPriority = filteredDetections.filter((detection) => detection.priority === 'Alta prioridad').length
    const processedImages = batchSummary._sum.processedImages ?? batchSummary._sum.totalImages ?? filteredDetections.length

    const speciesTable = Array.from(speciesStats.values()).map((item) => {
      const peak = topEntry(item.hourly)
      return {
        species: item.species,
        group: item.group,
        count: item.count,
        percentage: toPercent(item.count, totalPositive),
        averageConfidence: Math.round(item.confidenceSum / item.count),
        cameras: Array.from(item.cameras).sort(),
        peakActivityRange: peak?.[0] ?? 'Sin fecha de captura',
        firstCapture: item.firstCapture?.toISOString() ?? null,
        lastCapture: item.lastCapture?.toISOString() ?? null
      }
    }).sort((left, right) => right.count - left.count)

    const summary = {
      processedImages,
      animalDetections: totalPositive,
      withoutDetection,
      distinctSpecies: speciesMap.size,
      highPriority,
      pendingReviews,
      recordsWithoutCaptureDate
    }

    const selectedCameras = cameraIds.length > 0 ? allCameras.filter((camera) => cameraIds.includes(camera.id)) : allCameras
    const cameraLabel = cameraIds.length === 0 ? 'todas las camaras' : selectedCameras.length === 1 ? `${selectedCameras[0].code} ${selectedCameras[0].zone}` : `${selectedCameras.length} camaras seleccionadas`

    return NextResponse.json({
      filters: {
        cameraIds,
        dateFrom: start?.toISOString() ?? null,
        dateTo: end?.toISOString() ?? null,
        period,
        periodLabel: periodLabels[period] ?? periodLabels.all,
        taxonomyGroups,
        species: speciesFilter,
        priorities,
        minConfidence: Number.isFinite(minConfidence) ? minConfidence : 0,
        reviewStatus,
        dateField: 'capturedAt'
      },
      summary,
      executive: {
        period: periodLabels[period] ?? periodLabels.all,
        cameras: cameraLabel,
        dominantGroup: topGroup?.[0] ?? null,
        dominantSpecies: topSpecies?.[0] ?? null,
        peakActivityRange: topHour?.[0] ?? null,
        topCamera: topCamera?.[0] ?? null
      },
      taxonomyDistribution: Array.from(groupsMap.entries()).map(([name, value]) => ({ name, value, percentage: toPercent(value, totalPositive) })),
      speciesDistribution: Array.from(speciesMap.entries()).sort((left, right) => right[1] - left[1]).map(([name, value]) => ({ name, value, percentage: toPercent(value, totalPositive) })),
      cameraDistribution: Array.from(camerasMap.entries()).map(([name, value]) => ({ name, value })),
      priorityDistribution: Array.from(priorityMap.entries()).map(([name, value]) => ({ name, value, percentage: toPercent(value, filteredDetections.length) })),
      hourlyActivity: hourRanges.map((name) => ({ name, value: hourlyMap.get(name) ?? 0 })),
      dailyActivity: Array.from(dailyMap.entries()).map(([date, value]) => ({ date, value })),
      heatmap: Array.from({ length: 7 }, (_, day) => ({ day, hours: Array.from({ length: 24 }, (_, hour) => ({ hour, value: heatmapMap.get(`${day}-${hour}`) ?? 0 })) })),
      speciesTable,
      availableCameras: allCameras,
      availableSpecies: Array.from(new Set(detections.map((detection) => detection.species).filter((species) => species && !isExcludedSpecies(species)))).sort(),
      notes: {
        captureDate: 'El periodo filtra por capturedAt cuando existe. Los registros sin capturedAt se mantienen en conteos generales y se excluyen solo de graficos temporales.',
        withoutDetection: 'Sin deteccion, No CV Result, Unknown e imagenes no evaluables se tratan como imagenes sin fauna o sin clasificacion util; no se cuentan como especies detectadas.'
      }
    })
  } catch (error) {
    console.error('GET /api/reports error:', error)
    return NextResponse.json({ error: 'No se pudo generar el reporte' }, { status: 500 })
  }
}


