import { NextResponse } from 'next/server'
import { seedDetectionsIfEmpty } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { formatRelativeDate } from '@/lib/detections'

export const dynamic = 'force-dynamic'

function toPublicDetection(detection: {
  id: number
  imagePath: string
  species: string
  confidence: number
  location: string
  priority: string
  createdAt: Date
}) {
  return {
    id: detection.id,
    imagePath: detection.imagePath,
    species: detection.species,
    confidence: Math.round(detection.confidence),
    location: detection.location,
    priority: detection.priority,
    createdAt: detection.createdAt.toISOString(),
    time: formatRelativeDate(detection.createdAt)
  }
}

export async function GET() {
  await seedDetectionsIfEmpty()

  const detections = await prisma.detection.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  const total = await prisma.detection.count()
  const species = await prisma.detection.groupBy({
    by: ['species']
  })
  const confidence = await prisma.detection.aggregate({
    _avg: { confidence: true }
  })

  return NextResponse.json({
    metrics: [
      {
        label: 'Imagenes analizadas',
        value: total.toLocaleString('es-ES'),
        detail: 'Total de registros procesados'
      },
      {
        label: 'Especies',
        value: species.length.toString(),
        detail: 'Especies distintas detectadas'
      },
      {
        label: 'Confianza',
        value: `${Math.round(confidence._avg.confidence ?? 0)}%`,
        detail: 'Promedio de confianza YOLO'
      }
    ],
    detections: detections.map(toPublicDetection)
  })
}
