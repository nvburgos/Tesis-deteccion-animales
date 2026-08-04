import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { forbiddenByCsrf, verifySameOrigin } from '@/lib/requestSecurity'
import { toProtectedDetectionImagePath } from '@/lib/fileStorage'

export const dynamic = 'force-dynamic'

async function getCurrentUser() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) return null

  await ensureDatabase()
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
}

function getParams(context: { params: Promise<{ id: string }> }) {
  return context.params
}

function toPublicDetection(detection: {
  id: number
  imagePath: string
  species: string
  confidence: number
  location: string
  priority: string
  createdAt: Date
  capturedAt: Date | null
  captureDateSource: string | null
  cameraTrapCode: string | null
  temperatureCelsius: number | null
  temperatureFahrenheit: number | null
  visibleMetadataText: string | null
  individualMatchStatus: string | null
  individualMatchConfidence: number | null
  individualMatchBasis: string | null
  camera: { id: number; code: string; name: string; zone: string } | null
  batchJob: { id: number; zipName: string } | null
  user: { id: number; name: string; email: string } | null
}) {
  return {
    ...detection,
    batchJob: detection.batchJob,
    camera: detection.camera,
    capturedAt: detection.capturedAt?.toISOString() ?? null,
    createdAt: detection.createdAt.toISOString(),
    imagePath: toProtectedDetectionImagePath(detection.id),
    researcher: detection.user?.name ?? null,
    researcherEmail: detection.user?.email ?? null,
    user: detection.user
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  const { id } = await getParams(context)
  const individualId = Number(id)

  if (!Number.isInteger(individualId) || individualId <= 0) {
    return NextResponse.json({ error: 'Individual invalido' }, { status: 400 })
  }

  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? '1') || 1)
  const pageSize = Math.min(60, Math.max(6, Number(request.nextUrl.searchParams.get('pageSize') ?? '24') || 24))
  const where = {
    individualId,
    ...(isAdminRole(currentUser.role) ? {} : { userId: currentUser.id })
  }

  const [individual, total, detections] = await Promise.all([
    prisma.individual.findUnique({
      where: { id: individualId },
      select: { id: true, label: true, notes: true, species: true, createdAt: true, updatedAt: true }
    }),
    prisma.detection.count({ where }),
    prisma.detection.findMany({
      include: {
        batchJob: { select: { id: true, zipName: true } },
        camera: { select: { code: true, id: true, name: true, zone: true } },
        user: { select: { email: true, id: true, name: true } }
      },
      orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      where
    })
  ])

  if (!individual) {
    return NextResponse.json({ error: 'Individuo no encontrado' }, { status: 404 })
  }

  if (total === 0 && !isAdminRole(currentUser.role)) {
    return NextResponse.json({ error: 'No autorizado para ver este individuo' }, { status: 403 })
  }

  return NextResponse.json({
    detections: detections.map(toPublicDetection),
    individual: {
      ...individual,
      createdAt: individual.createdAt.toISOString(),
      detectionCount: total,
      updatedAt: individual.updatedAt.toISOString()
    },
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!verifySameOrigin(request)) return forbiddenByCsrf()

  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  const { id } = await getParams(context)
  const individualId = Number(id)
  const body = (await request.json().catch(() => null)) as { label?: string; notes?: string } | null
  const label = body?.label?.trim()

  if (!Number.isInteger(individualId) || individualId <= 0) {
    return NextResponse.json({ error: 'Individual invalido' }, { status: 400 })
  }

  if (!label) {
    return NextResponse.json({ error: 'El nombre del individuo es requerido' }, { status: 400 })
  }

  const individual = await prisma.individual.findUnique({
    where: { id: individualId },
    select: {
      id: true,
      detections: { select: { userId: true }, take: 20 }
    }
  })

  if (!individual) {
    return NextResponse.json({ error: 'Individuo no encontrado' }, { status: 404 })
  }

  const canEdit = isAdminRole(currentUser.role) || individual.detections.some((detection) => detection.userId === currentUser.id)

  if (!canEdit) {
    return NextResponse.json({ error: 'No autorizado para editar este individuo' }, { status: 403 })
  }

  const updatedIndividual = await prisma.individual.update({
    where: { id: individualId },
    data: {
      label,
      notes: body?.notes?.trim() || undefined
    },
    select: { id: true, label: true, notes: true, species: true, updatedAt: true }
  })

  return NextResponse.json({ individual: updatedIndividual })
}
