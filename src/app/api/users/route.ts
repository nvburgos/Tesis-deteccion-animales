import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_ROLE, AUTH_COOKIE, getSessionUserId, INVESTIGATOR_ROLE, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const USER_ROLES = [ADMIN_ROLE, INVESTIGATOR_ROLE] as const

type UpdateUserRoleBody = {
  role?: string
  userId?: number
}

async function getAdminUser() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) {
    return { error: NextResponse.json({ error: 'Sesion requerida' }, { status: 401 }) }
  }

  await ensureDatabase()

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true }
  })

  if (!isAdminRole(currentUser?.role)) {
    return { error: NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 }) }
  }

  return { currentUser }
}

export async function GET() {
  const { currentUser, error } = await getAdminUser()

  if (error) {
    return error
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: {
      createdAt: true,
      email: true,
      id: true,
      institution: true,
      name: true,
      role: true
    }
  })

  return NextResponse.json({
    currentUser,
    roles: USER_ROLES,
    users: users.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString()
    }))
  })
}

export async function PATCH(request: NextRequest) {
  const { error } = await getAdminUser()

  if (error) {
    return error
  }

  const body = (await request.json().catch(() => null)) as UpdateUserRoleBody | null
  const userId = Number(body?.userId)
  const role = body?.role

  if (!Number.isInteger(userId) || userId <= 0 || !role || !USER_ROLES.includes(role as (typeof USER_ROLES)[number])) {
    return NextResponse.json({ error: 'Usuario o rol invalido' }, { status: 400 })
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true }
  })

  if (!targetUser) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  if (targetUser.role === ADMIN_ROLE && role !== ADMIN_ROLE) {
    const adminCount = await prisma.user.count({ where: { role: ADMIN_ROLE } })

    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Debe existir al menos una cuenta admin' }, { status: 400 })
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: {
      createdAt: true,
      email: true,
      id: true,
      institution: true,
      name: true,
      role: true
    }
  })

  return NextResponse.json({
    user: {
      ...updatedUser,
      createdAt: updatedUser.createdAt.toISOString()
    }
  })
}
