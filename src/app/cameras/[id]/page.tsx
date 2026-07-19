import type { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import CameraDetail from '@/components/CameraDetail'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'

function toCameraSummary(camera: {
  id: number
  code: string
  name: string
  zone: string
  description: string | null
  active: boolean
  createdAt: Date
  updatedAt: Date
  detections: {
    createdAt: Date
    species: string
  }[]
}) {
  const positiveSpecies = new Set(
    camera.detections
      .map((detection) => detection.species)
      .filter((species) => species && species !== 'Sin deteccion')
  )
  const lastUpload = camera.detections
    .map((detection) => detection.createdAt)
    .sort((left, right) => right.getTime() - left.getTime())[0]

  return {
    id: camera.id,
    code: camera.code,
    name: camera.name,
    zone: camera.zone,
    description: camera.description,
    active: camera.active,
    createdAt: camera.createdAt.toISOString(),
    updatedAt: camera.updatedAt.toISOString(),
    lastUploadAt: lastUpload?.toISOString() ?? null,
    totalImagesProcessed: camera.detections.length,
    totalSpeciesDetected: positiveSpecies.size
  }
}

export default async function CameraPage({ params }: { params: Promise<{ id: string }> }) {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) {
    redirect('/login')
  }

  await ensureDatabase()

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true }
  })

  if (!currentUser) {
    redirect('/login')
  }

  const { id } = await params
  const cameraId = Number(id)

  if (!Number.isInteger(cameraId) || cameraId <= 0) {
    notFound()
  }

  const detectionWhere: Prisma.DetectionWhereInput = isAdminRole(currentUser.role) ? {} : { userId: currentUser.id }
  const camera = await prisma.camera.findFirst({
    include: {
      detections: {
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          species: true
        },
        where: detectionWhere
      }
    },
    where: { id: cameraId, active: true }
  })

  if (!camera) {
    notFound()
  }

  return <CameraDetail camera={toCameraSummary(camera)} />
}
