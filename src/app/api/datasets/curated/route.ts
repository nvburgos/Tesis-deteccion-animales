import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { isValidSpecies } from '@/lib/detectionClassification'
import { toProtectedDetectionImagePath } from '@/lib/fileStorage'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const curatedStatuses = ['Confirmada', 'Corregida']

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

  return { start: null, end: null }
}

function escapeCsv(value: string | number | null | undefined) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function datasetLabel(detection: { manualCorrectedSpecies: string | null; species: string }) {
  return detection.manualCorrectedSpecies?.trim() || detection.species
}

export async function GET(request: NextRequest) {
  try {
    const session = (await cookies()).get(AUTH_COOKIE)?.value
    const userId = getSessionUserId(session)

    if (!userId) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })

    await ensureDatabase()

    const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
    if (!currentUser) return NextResponse.json({ error: 'Sesion invalida' }, { status: 401 })

    const params = request.nextUrl.searchParams
    const cameraIds = parseIds(params.get('cameraIds'))
    const species = parseList(params.get('species'))
    const period = params.get('period') ?? 'all'
    const dateFrom = params.get('dateFrom') ?? params.get('from')
    const dateTo = params.get('dateTo') ?? params.get('to')
    const { start, end } = getPeriodRange(period, dateFrom, dateTo)
    const where: Prisma.DetectionWhereInput = {
      manualReviewStatus: { in: curatedStatuses },
      manualReviewedAt: { not: null },
      ...(isAdminRole(currentUser.role) ? {} : { userId: currentUser.id })
    }

    if (cameraIds.length > 0) where.cameraId = { in: cameraIds }
    if (species.length > 0) {
      where.OR = [
        { species: { in: species } },
        { manualCorrectedSpecies: { in: species } }
      ]
    }
    if (start && end) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { capturedAt: { gte: start, lt: end } },
            { capturedAt: null, createdAt: { gte: start, lt: end } }
          ]
        }
      ]
    }

    const detections = await prisma.detection.findMany({
      where,
      orderBy: [{ manualReviewedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        imagePath: true,
        species: true,
        confidence: true,
        manualOriginalSpecies: true,
        manualCorrectedSpecies: true,
        manualReviewStatus: true,
        manualReviewedAt: true,
        capturedAt: true,
        cameraTrapCode: true,
        temperatureCelsius: true,
        temperatureFahrenheit: true,
        camera: { select: { code: true, id: true, name: true, zone: true } },
        reviewedBy: { select: { email: true, id: true, name: true } }
      }
    })
    const curated = detections.filter((detection) => isValidSpecies(datasetLabel(detection)))
    const headers = [
      'detection_id',
      'image_url',
      'stored_image_path',
      'label',
      'species_current',
      'species_original',
      'species_corrected',
      'speciesnet_confidence',
      'review_status',
      'reviewed_at',
      'reviewed_by',
      'camera_id',
      'camera_code',
      'camera_name',
      'camera_zone',
      'camera_trap_code',
      'captured_at',
      'temperature_celsius',
      'temperature_fahrenheit'
    ]
    const rows = curated.map((detection) => [
      detection.id,
      toProtectedDetectionImagePath(detection.id),
      detection.imagePath,
      datasetLabel(detection),
      detection.species,
      detection.manualOriginalSpecies ?? '',
      detection.manualCorrectedSpecies ?? '',
      Math.round(detection.confidence),
      detection.manualReviewStatus ?? '',
      detection.manualReviewedAt?.toISOString() ?? '',
      detection.reviewedBy?.email ?? detection.reviewedBy?.name ?? '',
      detection.camera?.id ?? '',
      detection.camera?.code ?? '',
      detection.camera?.name ?? '',
      detection.camera?.zone ?? '',
      detection.cameraTrapCode ?? '',
      detection.capturedAt?.toISOString() ?? '',
      detection.temperatureCelsius ?? '',
      detection.temperatureFahrenheit ?? ''
    ])
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')

    return new NextResponse(csv, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="dataset-curado-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Content-Type': 'text/csv;charset=utf-8',
        'X-Curated-Dataset-Count': String(curated.length)
      }
    })
  } catch (error) {
    console.error('GET /api/datasets/curated error:', error)
    return NextResponse.json({ error: 'No se pudo exportar el dataset curado' }, { status: 500 })
  }
}
