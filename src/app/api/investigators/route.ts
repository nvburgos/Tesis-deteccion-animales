import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { AUTH_COOKIE, getSessionUserId, INVESTIGATOR_ROLE, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  await ensureDatabase()

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  })

  if (!isAdminRole(currentUser?.role)) {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 })
  }

  const investigators = await prisma.user.findMany({
    where: { role: INVESTIGATOR_ROLE },
    orderBy: { name: 'asc' },
    select: {
      email: true,
      id: true,
      institution: true,
      name: true
    }
  })

  return NextResponse.json({ investigators })
}
