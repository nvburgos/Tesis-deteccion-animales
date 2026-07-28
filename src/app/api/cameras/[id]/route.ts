import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { forbiddenByCsrf, verifySameOrigin } from '@/lib/requestSecurity'

export const dynamic = 'force-dynamic'

type CameraWithDetections = {
  id: number
  code: string
  name: string
  zone: string
  description: string | null
  latitude: number | null
  longitude: number | null
  active: boolean
  createdAt: Date
  updatedAt: Date
  detections: {
    createdAt: Date
    species: string
  }[]
}

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

function cleanCameraPayload(body: unknown) {
  const payload = body as Partial<Record<'name' | 'code' | 'zone' | 'description' | 'latitude' | 'longitude', unknown>> | null
  const latitude = typeof payload?.latitude === 'number' ? payload.latitude : Number(payload?.latitude ?? '')
  const longitude = typeof payload?.longitude === 'number' ? payload.longitude : Number(payload?.longitude ?? '')

  return {
    name: typeof payload?.name === 'string' ? payload.name.trim() : '',
    code: typeof payload?.code === 'string' ? payload.code.trim() : '',
    zone: typeof payload?.zone === 'string' ? payload.zone.trim() : '',
    description: typeof payload?.description === 'string' ? payload.description.trim() : '',
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null
  }
}

function hasInvalidCoordinates(payload: ReturnType<typeof cleanCameraPayload>) {
  const hasLatitude = payload.latitude !== null
  const hasLongitude = payload.longitude !== null

  if (hasLatitude !== hasLongitude) {
    return true
  }

  return (
    (payload.latitude !== null && (payload.latitude < -90 || payload.latitude > 90)) ||
    (payload.longitude !== null && (payload.longitude < -180 || payload.longitude > 180))
  )
}

function toCameraDetail(camera: CameraWithDetections) {
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
    latitude: camera.latitude,
    longitude: camera.longitude,
    active: camera.active,
    createdAt: camera.createdAt.toISOString(),
    updatedAt: camera.updatedAt.toISOString(),
    lastUploadAt: lastUpload?.toISOString() ?? null,
    totalImagesProcessed: camera.detections.length,
    totalSpeciesDetected: positiveSpecies.size
  }
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
      include: {
        detections: {
          orderBy: { createdAt: 'desc' },
          select: {
            createdAt: true,
            species: true
          },
          where: isAdminRole(currentUser.role) ? {} : { userId: currentUser.id }
        }
      },
      where: { id: cameraId, active: true }
    })

    if (!camera) {
      return NextResponse.json({ error: 'Camara no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ camera: toCameraDetail(camera) }, { status: 200 })
  } catch (error) {
    console.error('GET /api/cameras/[id] error:', error)
    return NextResponse.json({ error: 'No se pudo cargar la camara' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!verifySameOrigin(request)) return forbiddenByCsrf()
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
      return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
    }

    if (!isAdminRole(currentUser.role)) {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 })
    }

    const cameraId = await getCameraId(context)

    if (!cameraId) {
      return NextResponse.json({ error: 'Camara invalida' }, { status: 400 })
    }

    const payload = cleanCameraPayload(await request.json().catch(() => null))

    if (!payload.name || !payload.code || !payload.zone) {
      return NextResponse.json({ error: 'Nombre, codigo y zona son obligatorios' }, { status: 400 })
    }

    if (hasInvalidCoordinates(payload)) {
      return NextResponse.json({ error: 'Coordenadas invalidas' }, { status: 400 })
    }

    const camera = await prisma.camera.findFirst({
      where: { id: cameraId, active: true },
      select: { id: true, code: true }
    })

    if (!camera) {
      return NextResponse.json({ error: 'Camara no encontrada' }, { status: 404 })
    }

    if (payload.code !== camera.code) {
      const existingCamera = await prisma.camera.findUnique({
        where: { code: payload.code },
        select: { id: true }
      })

      if (existingCamera && existingCamera.id !== cameraId) {
        return NextResponse.json({ error: 'Ya existe una camara con ese codigo' }, { status: 409 })
      }
    }

    const updatedCamera = await prisma.camera.update({
      data: {
        code: payload.code,
        name: payload.name,
        zone: payload.zone,
        description: payload.description || null,
        latitude: payload.latitude,
        longitude: payload.longitude
      },
      include: {
        detections: {
          orderBy: { createdAt: 'desc' },
          select: {
            createdAt: true,
            species: true
          },
          where: isAdminRole(currentUser.role) ? {} : { userId: currentUser.id }
        }
      },
      where: { id: cameraId }
    })

    return NextResponse.json({ camera: toCameraDetail(updatedCamera) }, { status: 200 })
  } catch (error) {
    console.error('PATCH /api/cameras/[id] error:', error)
    return NextResponse.json({ error: 'No se pudo actualizar la camara' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!verifySameOrigin(request)) return forbiddenByCsrf()
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
      return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
    }

    if (!isAdminRole(currentUser.role)) {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 })
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

    await prisma.camera.update({
      data: { active: false },
      where: { id: cameraId }
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('DELETE /api/cameras/[id] error:', error)
    return NextResponse.json({ error: 'No se pudo eliminar la camara' }, { status: 500 })
  }
}





