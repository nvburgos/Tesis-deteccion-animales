import { NextResponse } from 'next/server'
import { AUTH_COOKIE, createSessionValue } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { verifyPassword } from '@/lib/passwords'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { forbiddenByCsrf, verifySameOrigin } from '@/lib/requestSecurity'

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) return forbiddenByCsrf()

  const rateLimit = checkRateLimit('login:' + getClientIp(request), 20, 15 * 60 * 1000)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Demasiados intentos de inicio de sesion. Intenta mas tarde.' }, { status: 429 })
  }
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null
  const email = body?.email?.trim().toLowerCase() ?? ''
  const password = body?.password ?? ''

  await ensureDatabase()

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true
    }
  })

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: 'Correo o contrasena incorrectos' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })

  response.cookies.set({
    name: AUTH_COOKIE,
    value: createSessionValue(user.id),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8
  })

  return response
}


