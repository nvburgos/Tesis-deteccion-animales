import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { seedDetectionsIfEmpty } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { formatRelativeDate } from '@/lib/detections'
import { AUTH_COOKIE, isValidSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function toPublicDetection(detection: {
  id: number
  imagePath: string
  species: string
  confidence: number
  location: string
  priority: string
  x1: number | null
  y1: number | null
  x2: number | null
  y2: number | null
  createdAt: Date
}) {
  return {
    id: detection.id,
    imagePath: detection.imagePath,
    species: detection.species,
    confidence: Math.round(detection.confidence),
    location: detection.location,
    priority: detection.priority,
    x1: detection.x1,
    y1: detection.y1,
    x2: detection.x2,
    y2: detection.y2,
    createdAt: detection.createdAt.toISOString(),
    time: formatRelativeDate(detection.createdAt)
  }
}

export async function GET(request: NextRequest) {
  const session = (await cookies()).get(AUTH_COOKIE)?.value

  if (!isValidSession(session)) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  await seedDetectionsIfEmpty()

  const searchParams = request.nextUrl.searchParams
  const speciesFilter = searchParams.get('species')?.trim()
  const dateFilter = searchParams.get('date')?.trim()
  const limit = searchParams.get('limit')
  const where: {
    species?: string
    createdAt?: {
      gte?: Date
      lt?: Date
    }
  } = {}

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
    orderBy: { createdAt: 'desc' },
    ...(limit === 'all' ? {} : { take: 20 })
  })

  const total = await prisma.detection.count()
  const totalDetections = await prisma.detection.count({
    where: {
      species: { not: 'Sin deteccion' },
      confidence: { gt: 0 }
    }
  })
  const species = await prisma.detection.groupBy({
    by: ['species'],
    where: {
      species: { not: 'Sin deteccion' }
    }
  })
  const confidence = await prisma.detection.aggregate({
    _avg: { confidence: true },
    where: {
      species: { not: 'Sin deteccion' },
      confidence: { gt: 0 }
    }
  })

  return NextResponse.json({
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
