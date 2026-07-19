import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type CameraWithDetections = {
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

function cleanCameraPayload(body: unknown) {
  const payload = body as Partial<Record<'name' | 'code' | 'zone' | 'description', unknown>> | null

  return {
    name: typeof payload?.name === 'string' ? payload.name.trim() : '',
    code: typeof payload?.code === 'string' ? payload.code.trim() : '',
    zone: typeof payload?.zone === 'string' ? payload.zone.trim() : '',
    description: typeof payload?.description === 'string' ? payload.description.trim() : ''
  }
}

function toCameraSummary(camera: CameraWithDetections) {
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

export async function GET() {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
      return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
    }

    const cameras = await prisma.camera.findMany({
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
      orderBy: { code: 'asc' },
      where: { active: true }
    })

    return NextResponse.json({ cameras: cameras.map(toCameraSummary) }, { status: 200 })
  } catch (error) {
    console.error('GET /api/cameras error:', error)
    return NextResponse.json({ error: 'No se pudieron cargar las camaras' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
      return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
    }

    const payload = cleanCameraPayload(await request.json().catch(() => null))

    if (!payload.name || !payload.code || !payload.zone) {
      return NextResponse.json({ error: 'Nombre, codigo y zona son obligatorios' }, { status: 400 })
    }

    const existingCamera = await prisma.camera.findUnique({
      where: { code: payload.code },
      select: { id: true }
    })

    if (existingCamera) {
      return NextResponse.json({ error: 'Ya existe una camara con ese codigo' }, { status: 409 })
    }

    const camera = await prisma.camera.create({
      data: {
        code: payload.code,
        name: payload.name,
        zone: payload.zone,
        description: payload.description || null
      },
      include: {
        detections: {
          select: {
            createdAt: true,
            species: true
          },
          where: isAdminRole(currentUser.role) ? {} : { userId: currentUser.id }
        }
      }
    })

    return NextResponse.json({ camera: toCameraSummary(camera) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/cameras error:', error)
    return NextResponse.json({ error: 'No se pudo crear la camara' }, { status: 500 })
  }
}
