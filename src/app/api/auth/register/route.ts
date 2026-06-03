import { NextResponse } from 'next/server'
import { AUTH_COOKIE, createSessionValue } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { hashPassword } from '@/lib/passwords'
import { prisma } from '@/lib/prisma'

type RegisterBody = {
  email?: string
  institution?: string
  name?: string
  password?: string
}

function isPrismaUniqueError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RegisterBody | null
  const name = body?.name?.trim() ?? ''
  const email = body?.email?.trim().toLowerCase() ?? ''
  const password = body?.password ?? ''
  const institution = body?.institution?.trim() || null

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Nombre, correo y contrasena son obligatorios' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'La contrasena debe tener al menos 6 caracteres' }, { status: 400 })
  }

  try {
    await ensureDatabase()

    const user = await prisma.user.create({
      data: {
        email,
        institution,
        name,
        passwordHash: hashPassword(password)
      },
      select: {
        email: true,
        id: true,
        name: true
      }
    })

    const response = NextResponse.json({ ok: true, user })

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
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 })
    }

    console.error('Register API error:', error)
    return NextResponse.json({ error: 'No se pudo crear el usuario' }, { status: 500 })
  }
}
