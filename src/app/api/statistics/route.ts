import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { getConfidenceBucket, isPositiveFaunaDetection, isValidDistinctSpecies, isWithoutDetectionResult } from '@/lib/detectionClassification'
import { isPendingManualReview } from '@/lib/manualReviewPolicy'
import { hasDetectionCaptureColumns } from '@/lib/detectionCaptureColumns'
import { prisma } from '@/lib/prisma'
import { getTaxonomicGroup, type TaxonomicGroup } from '@/lib/speciesTaxonomy'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

const hourRanges = ['00:00-03:00', '03:00-06:00', '06:00-09:00', '09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00', '21:00-00:00']
const confidenceBuckets = ['90-100 %', '80-89 %', '70-79 %', '50-69 %', 'Menor de 50 %']

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
  if (period === '7d') return { start: addDays(today, -7), end: addDays(today, 1) }
  if (period === '30d') return { start: addDays(today, -30), end: addDays(today, 1) }
  if (period === '90d') return { start: addDays(today, -90), end: addDays(today, 1) }
  if (period === 'year') return { start: new Date(now.getFullYear(), 0, 1), end: addDays(today, 1) }
  if (period === 'custom' && from && to) return { start: new Date(`${from}T00:00:00`), end: addDays(new Date(`${to}T00:00:00`), 1) }
  return { start: null, end: null }
}

function inCaptureRange(date: Date | null | undefined, start: Date | null, end: Date | null) {
  if (!start || !end) return true
  if (!date) return true
  return date >= start && date < end
}

function inStrictRange(date: Date | null | undefined, start: Date | null, end: Date | null) {
  if (!start || !end) return true
  return Boolean(date && date >= start && date < end)
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function topEntry(map: Map<string, number>) {
  return Array.from(map.entries()).sort((left, right) => right[1] - left[1])[0] ?? null
}

function toPercent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function captureDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function hourRange(date: Date) {
  return hourRanges[Math.floor(date.getHours() / 3)] ?? hourRanges[0]
}

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit('statistics:' + getClientIp(request), 120, 15 * 60 * 1000)
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
    const researcherIds = parseIds(params.get('researcherIds'))
    const taxonomyGroups = parseList(params.get('taxonomyGroups')) as TaxonomicGroup[]
    const speciesFilter = parseList(params.get('species'))
    const minConfidence = Number(params.get('minConfidence') ?? 0)
    const period = params.get('period') ?? 'all'
    const dateFrom = params.get('dateFrom')
    const dateTo = params.get('dateTo')
    const { start, end } = getPeriodRange(period, dateFrom, dateTo)
    const isAdmin = isAdminRole(currentUser.role)
    const hasCaptureColumns = await hasDetectionCaptureColumns()

    const ownershipWhere: Prisma.DetectionWhereInput = isAdmin
      ? {}
      : { OR: [{ userId: currentUser.id }, { batchJob: { userId: currentUser.id } }] }
    const where: Prisma.DetectionWhereInput = { ...ownershipWhere }

    if (cameraIds.length > 0) where.cameraId = { in: cameraIds }
    if (isAdmin && researcherIds.length > 0) where.OR = [{ userId: { in: researcherIds } }, { batchJob: { userId: { in: researcherIds } } }]
    if (speciesFilter.length > 0) where.species = { in: speciesFilter }
    if (Number.isFinite(minConfidence) && minConfidence > 0) where.confidence = { gte: minConfidence }

    const batchWhere: Prisma.BatchJobWhereInput = isAdmin ? {} : { userId: currentUser.id }
    if (cameraIds.length > 0) batchWhere.cameraId = { in: cameraIds }
    if (isAdmin && researcherIds.length > 0) batchWhere.userId = { in: researcherIds }
    if (start && end) batchWhere.OR = [{ completedAt: { gte: start, lt: end } }, { completedAt: null, createdAt: { gte: start, lt: end } }]

    const [availableCameras, availableResearchers, _totalBeforeFilters, detections, _completedBatches, batchSummary] = await Promise.all([
      prisma.camera.findMany({ where: { active: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, zone: true } }),
      isAdmin ? prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
      prisma.detection.count({ where: ownershipWhere }),
      prisma.detection.findMany({
        where,
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
          userId: true,
          batchJobId: true,
          ...(hasCaptureColumns ? { capturedAt: true } : {}),
          batchJob: { select: { id: true, userId: true } },
          camera: { select: { id: true, code: true, name: true, zone: true } },
          user: { select: { id: true, name: true, email: true } }
        }
      }),
      prisma.batchJob.count({ where: { ...batchWhere, status: 'Completado' } }),
      prisma.batchJob.aggregate({ _sum: { processedImages: true, totalImages: true }, where: { ...batchWhere, status: 'Completado' } })
    ])

    const afterCaptureWindow = detections.filter((detection) => inCaptureRange(hasCaptureColumns ? (detection.capturedAt ?? null) : null, start, end))
    const filteredDetections = afterCaptureWindow.filter((detection) => taxonomyGroups.length === 0 || taxonomyGroups.includes(getTaxonomicGroup(detection.species)))
    const positiveDetections = filteredDetections.filter((detection) => isPositiveFaunaDetection(detection.species, detection.confidence))
    const withoutDetection = filteredDetections.filter((detection) => isWithoutDetectionResult(detection.species, detection.confidence)).length
    const distinctSpecies = new Set(positiveDetections.filter((detection) => isValidDistinctSpecies(detection.species, detection.confidence)).map((detection) => detection.species)).size
    const averageConfidence = positiveDetections.length > 0 ? Math.round(positiveDetections.reduce((sum, detection) => sum + detection.confidence, 0) / positiveDetections.length) : 0
    const pendingReviews = filteredDetections.filter(isPendingManualReview).length
    const recordsWithoutCaptureDate = filteredDetections.filter((detection) => !('capturedAt' in detection) || !detection.capturedAt).length

    const dailyMap = new Map<string, number>()
    const taxonomyMap = new Map<string, number>()
    const speciesMap = new Map<string, { cameraCounts: Map<string, number>; confidenceSum: number; count: number; group: string; lastCapture: Date | null; species: string }>()
    const cameraStats = new Map<string, { analyzed: number; code: string; detections: number; id: number; name: string; species: Set<string> }>()
    const hourlyMap = new Map<string, number>()
    const confidenceMap = new Map<string, number>()

    for (const bucket of confidenceBuckets) increment(confidenceMap, bucket, 0)
    for (const range of hourRanges) increment(hourlyMap, range, 0)

    for (const detection of filteredDetections) {
      const camera = detection.camera
      const cameraKey = camera ? String(camera.id) : 'none'
      const cameraLabel = camera ? `${camera.code} ${camera.name}` : 'Sin camara'
      const currentCamera = cameraStats.get(cameraKey) ?? { analyzed: 0, code: camera?.code ?? 'N/A', detections: 0, id: camera?.id ?? 0, name: cameraLabel, species: new Set<string>() }
      currentCamera.analyzed += 1
      cameraStats.set(cameraKey, currentCamera)
    }

    for (const detection of positiveDetections) {
      const capture = hasCaptureColumns ? (detection.capturedAt ?? null) : null
      const group = getTaxonomicGroup(detection.species)
      const camera = detection.camera
      const cameraKey = camera ? String(camera.id) : 'none'
      const cameraLabel = camera ? `${camera.code} ${camera.name}` : 'Sin camara'

      increment(taxonomyMap, group)
      increment(confidenceMap, getConfidenceBucket(detection.confidence))

      const speciesEntry = speciesMap.get(detection.species) ?? { cameraCounts: new Map<string, number>(), confidenceSum: 0, count: 0, group, lastCapture: null, species: detection.species }
      speciesEntry.count += 1
      speciesEntry.confidenceSum += detection.confidence
      increment(speciesEntry.cameraCounts, cameraLabel)
      if (capture) speciesEntry.lastCapture = !speciesEntry.lastCapture || capture > speciesEntry.lastCapture ? capture : speciesEntry.lastCapture
      speciesMap.set(detection.species, speciesEntry)

      const currentCamera = cameraStats.get(cameraKey) ?? { analyzed: 0, code: camera?.code ?? 'N/A', detections: 0, id: camera?.id ?? 0, name: cameraLabel, species: new Set<string>() }
      currentCamera.detections += 1
      currentCamera.species.add(detection.species)
      cameraStats.set(cameraKey, currentCamera)

      if (capture && inStrictRange(capture, start, end)) {
        increment(dailyMap, captureDateKey(capture))
        increment(hourlyMap, hourRange(capture))
      }
    }

    const totalPositive = positiveDetections.length
    const topSpecies = Array.from(speciesMap.values()).map((entry) => {
      const topCamera = topEntry(entry.cameraCounts)
      return {
        species: entry.species,
        group: entry.group,
        records: entry.count,
        percentage: toPercent(entry.count, totalPositive),
        averageConfidence: Math.round(entry.confidenceSum / entry.count),
        topCamera: topCamera?.[0] ?? 'Sin camara',
        lastCapture: entry.lastCapture?.toISOString() ?? null
      }
    }).sort((left, right) => right.records - left.records)

    const cameraPerformance = Array.from(cameraStats.values()).map((entry) => ({
      id: entry.id,
      code: entry.code,
      name: entry.name,
      analyzedImages: entry.analyzed,
      animalDetections: entry.detections,
      detectionRate: entry.analyzed > 0 ? Math.round((entry.detections / entry.analyzed) * 100) : 0,
      distinctSpecies: entry.species.size
    })).sort((left, right) => right.animalDetections - left.animalDetections)

    const dominantSpecies = topSpecies[0]?.species ?? null
    const dominantTaxonomyGroup = topEntry(taxonomyMap)?.[0] ?? null
    const topCamera = cameraPerformance[0] ? `${cameraPerformance[0].code} ${cameraPerformance[0].name}` : null
    const peak = topEntry(hourlyMap)
    const peakActivityRange = peak && peak[1] > 0 ? peak[0] : null
    const processedImages = batchSummary._sum.processedImages ?? batchSummary._sum.totalImages ?? filteredDetections.length
    const summary = { processedImages, animalDetections: totalPositive, withoutDetection, distinctSpecies, averageConfidence, pendingReviews, recordsWithoutCaptureDate }

    return NextResponse.json({
      summary,
      dailyTrend: Array.from(dailyMap.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)),
      taxonomyDistribution: Array.from(taxonomyMap.entries()).map(([name, value]) => ({ name, value, percentage: toPercent(value, totalPositive) })),
      topSpecies,
      cameraPerformance,
      hourlyActivity: hourRanges.map((name) => ({ name, value: hourlyMap.get(name) ?? 0 })),
      confidenceDistribution: confidenceBuckets.map((name) => ({ name, value: confidenceMap.get(name) ?? 0 })),
      findings: { dominantSpecies, dominantTaxonomyGroup, topCamera, peakActivityRange, averageConfidence, pendingReviews },
      availableFilters: {
        cameras: availableCameras,
        researchers: availableResearchers,
        species: Array.from(new Set(detections.filter((detection) => isPositiveFaunaDetection(detection.species, detection.confidence)).map((detection) => detection.species))).sort(),
        taxonomyGroups: ['Mamifero', 'Ave', 'Reptil', 'Anfibio', 'Otro', 'Sin clasificar']
      },
      rules: {
        positiveDetection: 'Especie valida con confidence > 0; excluye Sin deteccion, No CV Result, Unknown, nulos y no evaluables.',
        withoutDetection: 'Sin deteccion, No CV Result, Unknown, no evaluables, valores vacios o confidence <= 0.',
        temporalSource: 'capturedAt para tendencias de fauna; registros sin capturedAt solo se excluyen de graficos temporales.',
        researcher: 'Investigador corresponde al usuario propietario de la deteccion o al usuario que cargo el lote asociado.'
      }
    })
  } catch (error) {
    console.error('GET /api/statistics error:', error)
    return NextResponse.json({ error: 'No se pudieron cargar las estadisticas' }, { status: 500 })
  }
}

