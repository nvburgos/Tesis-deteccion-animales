import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

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

async function getCameraId(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const cameraId = Number(id)

  return Number.isInteger(cameraId) && cameraId > 0 ? cameraId : null
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
      return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
    }

    const cameraId = await getCameraId(context)

    if (!cameraId) {
      return NextResponse.json({ error: 'Camara invalida' }, { status: 400 })
    }

    const camera = await prisma.camera.findFirst({
      where: { id: cameraId, active: true },
      select: { id: true }
    })

    if (!camera) {
      return NextResponse.json({ error: 'Camara no encontrada' }, { status: 404 })
    }

    const userFilter = isAdminRole(currentUser.role) ? {} : { userId: currentUser.id }
    const detectionWhere = { cameraId, ...userFilter }
    const completedBatchWhere = { cameraId, status: 'Completado', ...userFilter }
    const excludedSpecies = [
      'Sin deteccion',
      'Sin detecci\u00f3n',
      'No CV Result',
      'no cv result',
      'Unknown',
      'unknown',
      ''
    ]
    const faunaDetectionWhere = {
      ...detectionWhere,
      species: { notIn: excludedSpecies },
      confidence: { gt: 0 }
    }

    const [completedBatches, imageTotals, totalDetections, distinctSpecies, imagesWithoutDetection] = await Promise.all([
      prisma.batchJob.count({
        where: completedBatchWhere
      }),
      prisma.batchJob.aggregate({
        _sum: { totalImages: true },
        where: completedBatchWhere
      }),
      prisma.detection.count({
        where: faunaDetectionWhere
      }),
      prisma.detection.findMany({
        distinct: ['species'],
        select: { species: true },
        where: faunaDetectionWhere
      }),
      prisma.detection.count({
        where: {
          ...detectionWhere,
          OR: [
            { species: { in: excludedSpecies } },
            { confidence: 0 }
          ]
        }
      })
    ])

    return NextResponse.json({
      completedBatches,
      totalImages: imageTotals._sum.totalImages ?? 0,
      totalDetections,
      totalSpecies: distinctSpecies.length,
      imagesWithoutDetection
    }, { status: 200 })
  } catch (error) {
    console.error('GET /api/cameras/[id]/stats error:', error)
    return NextResponse.json({ error: 'No se pudieron cargar las estadisticas de la camara' }, { status: 500 })
  }
}
