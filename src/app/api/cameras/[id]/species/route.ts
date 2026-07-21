import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { toProtectedDetectionImagePath } from '@/lib/fileStorage'
import { getSpeciesLabel } from '@/lib/i18n'
import { getTaxonomicGroup, normalizeTaxonomyKey } from '@/lib/speciesTaxonomy'
import { invalidSpeciesValues, isPositiveFaunaDetection } from '@/lib/detectionClassification'
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

async function getCameraId(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const cameraId = Number(id)
  return Number.isInteger(cameraId) && cameraId > 0 ? cameraId : null
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

function parseDate(value: string | null) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

type Summary = {
  averageConfidence: number
  confidenceTotal: number
  firstCapturedAt: Date | null
  imagePath: string
  lastCapturedAt: Date | null
  pendingReviews: number
  records: number
  recordsWithCaptureDate: number
  species: string
  taxonomicGroup: string
  timestamps: Date[]
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })

    const cameraId = await getCameraId(context)
    if (!cameraId) return NextResponse.json({ error: 'Camara invalida' }, { status: 400 })

    const camera = await prisma.camera.findFirst({ where: { id: cameraId, active: true }, select: { code: true, id: true, name: true, zone: true } })
    if (!camera) return NextResponse.json({ error: 'Camara no encontrada' }, { status: 404 })

    const hasCaptureColumns = await hasDetectionCaptureColumns()
    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(50, Math.max(10, Number(searchParams.get('pageSize') ?? '20') || 20))
    const search = normalizeTaxonomyKey(searchParams.get('search'))
    const groupFilter = searchParams.get('group')?.trim() ?? ''
    const sort = searchParams.get('sort')?.trim() ?? 'records'
    const fromDate = parseDate(searchParams.get('from'))
    const toDate = parseDate(searchParams.get('to'))
    const where: Prisma.DetectionWhereInput = {
      cameraId,
      confidence: { gt: 0 },
      species: { notIn: invalidSpeciesValues }
    }

    if (!isAdminRole(currentUser.role)) where.userId = currentUser.id
    if ((fromDate || toDate) && hasCaptureColumns) {
      where.capturedAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lt: new Date(toDate.getTime() + 24 * 60 * 60 * 1000) } : {})
      }
    } else if ((fromDate || toDate) && !hasCaptureColumns) {
      where.id = -1
    }

    const detections = await prisma.detection.findMany({
      orderBy: { createdAt: 'desc' },
      select: { confidence: true, createdAt: true, id: true, imagePath: true, manualReviewedAt: true, species: true, ...(hasCaptureColumns ? { capturedAt: true } : {}) },
      where
    })

    const summaries = new Map<string, Summary>()
    detections.forEach((detection) => {
      if (!isPositiveFaunaDetection(detection.species, detection.confidence)) return
      const speciesLabel = getSpeciesLabel(detection.species, 'es')
      const taxonomicGroup = getTaxonomicGroup(detection.species)
      const normalizedSearchTarget = normalizeTaxonomyKey(`${detection.species} ${speciesLabel}`)
      if (search && !normalizedSearchTarget.includes(search)) return
      if (groupFilter && taxonomicGroup !== groupFilter) return

      const current = summaries.get(detection.species) ?? {
        averageConfidence: 0,
        confidenceTotal: 0,
        firstCapturedAt: null,
        imagePath: String(detection.id),
        lastCapturedAt: null,
        pendingReviews: 0,
        records: 0,
        recordsWithCaptureDate: 0,
        species: detection.species,
        taxonomicGroup,
        timestamps: []
      }

      current.records += 1
      current.confidenceTotal += detection.confidence
      current.averageConfidence = current.confidenceTotal / current.records
      current.pendingReviews += detection.manualReviewedAt ? 0 : 1
      const capturedAt = hasCaptureColumns ? (detection as { capturedAt?: Date | null }).capturedAt : null
      if (capturedAt) {
        current.recordsWithCaptureDate += 1
        current.timestamps.push(capturedAt)
        if (!current.firstCapturedAt || capturedAt < current.firstCapturedAt) current.firstCapturedAt = capturedAt
        if (!current.lastCapturedAt || capturedAt > current.lastCapturedAt) {
          current.lastCapturedAt = capturedAt
          current.imagePath = String(detection.id)
        }
      }
      summaries.set(detection.species, current)
    })

    let rows = [...summaries.values()].map((item) => ({
      averageConfidence: item.averageConfidence,
      firstDetectedAt: item.firstCapturedAt?.toISOString() ?? null,
      lastDetectedAt: item.lastCapturedAt?.toISOString() ?? null,
      peakActivityRange: getPeakRange(item.timestamps),
      pendingReviews: item.pendingReviews,
      rawSpecies: item.species,
      records: item.records,
      recordsWithCaptureDate: item.recordsWithCaptureDate,
      recordsWithoutCaptureDate: item.records - item.recordsWithCaptureDate,
      species: getSpeciesLabel(item.species, 'es'),
      speciesKey: encodeURIComponent(item.species),
      taxonomicGroup: item.taxonomicGroup,
      thumbnail: toProtectedDetectionImagePath(Number(item.imagePath))
    }))

    if (sort === 'recent') rows = rows.sort((a, b) => new Date(b.lastDetectedAt ?? 0).getTime() - new Date(a.lastDetectedAt ?? 0).getTime())
    else if (sort === 'confidence') rows = rows.sort((a, b) => b.averageConfidence - a.averageConfidence)
    else if (sort === 'alphabetical') rows = rows.sort((a, b) => a.species.localeCompare(b.species, 'es'))
    else rows = rows.sort((a, b) => b.records - a.records)

    const groupCounts = new Map<string, number>()
    const allTimestamps: Date[] = []
    rows.forEach((row) => {
      groupCounts.set(row.taxonomicGroup, (groupCounts.get(row.taxonomicGroup) ?? 0) + row.records)
      const source = summaries.get(row.rawSpecies)
      if (source) allTimestamps.push(...source.timestamps)
    })

    const predominantGroup = [...groupCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Sin datos'
    const totalRecords = rows.reduce((sum, row) => sum + row.records, 0)
    const recordsWithCaptureDate = rows.reduce((sum, row) => sum + row.recordsWithCaptureDate, 0)
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))

    return NextResponse.json({
      camera,
      metrics: { totalSpecies: rows.length, totalFaunaRecords: totalRecords, recordsWithCaptureDate, recordsWithoutCaptureDate: totalRecords - recordsWithCaptureDate, predominantGroup, peakActivityRange: getPeakRange(allTimestamps) },
      species: rows.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total: rows.length, totalPages },
      timeSource: 'capturedAt',
      timeSourceLabel: 'Fecha de captura',
      limitation: hasCaptureColumns ? 'La actividad temporal usa solo Detection.capturedAt. Los registros sin fecha de captura se excluyen de graficos y franjas horarias.' : 'La migracion de fecha de captura aun no esta aplicada. Se listan especies, pero la actividad temporal queda sin datos.'
    })
  } catch (error) {
    console.error('GET /api/cameras/[id]/species error:', error)
    return NextResponse.json({ error: 'No se pudo cargar el analisis de especies' }, { status: 500 })
  }
}


