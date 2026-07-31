import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { resolveStoredDetectionPath } from '@/lib/fileStorage'
import { forbiddenByCsrf, verifySameOrigin } from '@/lib/requestSecurity'
import { compareDetectionCrops } from '@/lib/visualSignature'

export const dynamic = 'force-dynamic'

type MatchDecision = 'same' | 'different' | 'unsure'

async function getCurrentUser() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) return null

  await ensureDatabase()
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
}

function isMatchDecision(value: unknown): value is MatchDecision {
  return value === 'same' || value === 'different' || value === 'unsure'
}

async function createIndividual(species: string) {
  const individual = await prisma.individual.create({ data: { species }, select: { id: true } })
  return prisma.individual.update({
    where: { id: individual.id },
    data: { label: `${species} #${individual.id}` },
    select: { id: true, label: true, species: true }
  })
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  const referenceDetectionId = Number(request.nextUrl.searchParams.get('referenceDetectionId'))
  const candidateDetectionId = Number(request.nextUrl.searchParams.get('candidateDetectionId'))

  if (!Number.isInteger(referenceDetectionId) || referenceDetectionId <= 0 || !Number.isInteger(candidateDetectionId) || candidateDetectionId <= 0) {
    return NextResponse.json({ error: 'Detecciones invalidas' }, { status: 400 })
  }

  const [referenceDetection, candidateDetection] = await Promise.all([
    prisma.detection.findUnique({
      where: { id: referenceDetectionId },
      select: { capturedAt: true, cameraId: true, createdAt: true, id: true, imagePath: true, species: true, userId: true, x1: true, x2: true, y1: true, y2: true }
    }),
    prisma.detection.findUnique({
      where: { id: candidateDetectionId },
      select: { capturedAt: true, cameraId: true, createdAt: true, id: true, imagePath: true, species: true, userId: true, x1: true, x2: true, y1: true, y2: true }
    })
  ])

  if (!referenceDetection || !candidateDetection) {
    return NextResponse.json({ error: 'Deteccion no encontrada' }, { status: 404 })
  }

  const canRead =
    isAdminRole(currentUser.role) ||
    (referenceDetection.userId === currentUser.id && candidateDetection.userId === currentUser.id)

  if (!canRead) {
    return NextResponse.json({ error: 'No autorizado para comparar estas detecciones' }, { status: 403 })
  }

  const referencePath = resolveStoredDetectionPath(referenceDetection.imagePath)
  const candidatePath = resolveStoredDetectionPath(candidateDetection.imagePath)
  const visualSimilarity = referencePath && candidatePath
    ? await compareDetectionCrops(referencePath, referenceDetection, candidatePath, candidateDetection).catch(() => null)
    : null
  const referenceDate = referenceDetection.capturedAt ?? referenceDetection.createdAt
  const candidateDate = candidateDetection.capturedAt ?? candidateDetection.createdAt
  const timeGapHours = Math.round((Math.abs(referenceDate.getTime() - candidateDate.getTime()) / 36e5) * 10) / 10

  return NextResponse.json({
    comparison: {
      sameCamera: Boolean(referenceDetection.cameraId && referenceDetection.cameraId === candidateDetection.cameraId),
      sameSpecies: referenceDetection.species === candidateDetection.species,
      timeGapHours,
      visualSimilarity
    }
  })
}

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return forbiddenByCsrf()

  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    candidateDetectionId?: number
    decision?: string
    referenceDetectionId?: number
  } | null
  const referenceDetectionId = Number(body?.referenceDetectionId)
  const candidateDetectionId = Number(body?.candidateDetectionId)

  if (!Number.isInteger(referenceDetectionId) || referenceDetectionId <= 0 || !Number.isInteger(candidateDetectionId) || candidateDetectionId <= 0) {
    return NextResponse.json({ error: 'Detecciones invalidas' }, { status: 400 })
  }

  if (referenceDetectionId === candidateDetectionId) {
    return NextResponse.json({ error: 'Selecciona dos detecciones diferentes' }, { status: 400 })
  }

  if (!isMatchDecision(body?.decision)) {
    return NextResponse.json({ error: 'Decision invalida' }, { status: 400 })
  }

  const [referenceDetection, candidateDetection] = await Promise.all([
    prisma.detection.findUnique({
      where: { id: referenceDetectionId },
      select: { id: true, individualId: true, species: true, userId: true }
    }),
    prisma.detection.findUnique({
      where: { id: candidateDetectionId },
      select: { id: true, individualId: true, species: true, userId: true }
    })
  ])

  if (!referenceDetection || !candidateDetection) {
    return NextResponse.json({ error: 'Deteccion no encontrada' }, { status: 404 })
  }

  const canEdit =
    isAdminRole(currentUser.role) ||
    (referenceDetection.userId === currentUser.id && candidateDetection.userId === currentUser.id)

  if (!canEdit) {
    return NextResponse.json({ error: 'No autorizado para editar estos individuos' }, { status: 403 })
  }

  if (referenceDetection.species !== candidateDetection.species) {
    return NextResponse.json({ error: 'Solo se pueden comparar detecciones de la misma especie' }, { status: 400 })
  }

  if (body.decision === 'same') {
    const referenceIndividual = referenceDetection.individualId
      ? { id: referenceDetection.individualId }
      : await createIndividual(referenceDetection.species)

    await prisma.detection.update({
      where: { id: referenceDetection.id },
      data: {
        individualId: referenceIndividual.id,
        individualMatchBasis: 'confirmado manualmente como referencia',
        individualMatchConfidence: 100,
        individualMatchStatus: 'Confirmado manualmente'
      }
    })

    await prisma.detection.update({
      where: { id: candidateDetection.id },
      data: {
        individualId: referenceIndividual.id,
        individualMatchBasis: `confirmado manualmente con deteccion #${referenceDetection.id}`,
        individualMatchConfidence: 100,
        individualMatchStatus: 'Confirmado manualmente'
      }
    })

    return NextResponse.json({ decision: body.decision, individualId: referenceIndividual.id })
  }

  if (body.decision === 'different') {
    const individual = await createIndividual(candidateDetection.species)
    await prisma.detection.update({
      where: { id: candidateDetection.id },
      data: {
        individualId: individual.id,
        individualMatchBasis: `separado manualmente de deteccion #${referenceDetection.id}`,
        individualMatchConfidence: 100,
        individualMatchStatus: 'Individuo distinto confirmado'
      }
    })

    return NextResponse.json({ decision: body.decision, individualId: individual.id })
  }

  await prisma.detection.update({
    where: { id: candidateDetection.id },
    data: {
      individualMatchBasis: `comparacion manual insegura con deteccion #${referenceDetection.id}`,
      individualMatchConfidence: null,
      individualMatchStatus: 'Inseguro'
    }
  })

  return NextResponse.json({ decision: body.decision, individualId: candidateDetection.individualId })
}
