import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { forbiddenByCsrf, verifySameOrigin } from '@/lib/requestSecurity'

export const dynamic = 'force-dynamic'

async function getCurrentUser() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) return null

  await ensureDatabase()
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!verifySameOrigin(request)) return forbiddenByCsrf()

  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  const { id } = await context.params
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
