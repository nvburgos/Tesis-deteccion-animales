import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ADMIN_ROLE, AUTH_COOKIE, createSessionValue, getSessionUserId, INVESTIGATOR_ROLE, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { hashPassword } from '@/lib/passwords'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { forbiddenByCsrf, verifySameOrigin } from '@/lib/requestSecurity'
import { isEmailProviderConfigured, sendRegistrationEmailOtp } from '@/lib/email'
import { normalizePhoneNumber } from '@/lib/whatsapp'

type RegisterBody = {
  email?: string
  institution?: string
  name?: string
  password?: string
  otpCode?: string
  phoneNumber?: string
}

function isPrismaUniqueError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

function getOtpSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET es obligatorio en produccion')
  return 'wildlife-local-development-secret'
}

function hashOtp(email: string, phoneNumber: string, code: string) {
  return createHash('sha256')
    .update(`${email}:${phoneNumber}:${code}:${getOtpSecret()}`)
    .digest('hex')
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function createOtpCode() {
  return String(randomInt(100000, 1000000))
}

async function getRegistrationContext() {
  const userCount = await prisma.user.count()
  const publicRegistrationAllowed = process.env.ALLOW_PUBLIC_REGISTRATION === 'true'
  let adminSession = false

  if (userCount > 0 && !publicRegistrationAllowed) {
    const session = (await cookies()).get(AUTH_COOKIE)?.value
    const sessionUserId = getSessionUserId(session)

    if (!sessionUserId) {
      return { error: NextResponse.json({ error: 'Registro publico deshabilitado' }, { status: 403 }) }
    }

    const currentUser = await prisma.user.findUnique({ where: { id: sessionUserId }, select: { role: true } })
    adminSession = isAdminRole(currentUser?.role)

    if (!adminSession) {
      return { error: NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 }) }
    }
  }

  return { adminSession, userCount }
}

async function sendOtpResponse(email: string) {
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } })

  if (existingUser) {
    return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 })
  }

  const code = createOtpCode()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await prisma.registrationOtp.updateMany({
    data: { consumedAt: new Date() },
    where: { consumedAt: null, email }
  })
  await prisma.registrationOtp.create({
    data: {
      codeHash: hashOtp(email, 'email', code),
      email,
      expiresAt
    }
  })
  try {
    await sendRegistrationEmailOtp(email, code)
  } catch (error) {
    console.error('Email OTP error:', error)
    return NextResponse.json({ error: 'No se pudo enviar el codigo por correo. Revisa RESEND_API_KEY y EMAIL_FROM.' }, { status: 503 })
  }

  return NextResponse.json({
    delivery: isEmailProviderConfigured() ? 'email' : 'console',
    devOtp: process.env.NODE_ENV === 'production' || isEmailProviderConfigured() ? undefined : code,
    expiresAt: expiresAt.toISOString(),
    ok: true,
    otpRequired: true
  })
}

async function verifyOtp(email: string, code: string) {
  const otp = await prisma.registrationOtp.findFirst({
    orderBy: { createdAt: 'desc' },
    where: {
      consumedAt: null,
      email,
      expiresAt: { gt: new Date() }
    }
  })

  if (!otp) {
    return { error: 'Codigo expirado o inexistente' }
  }

  if (otp.attempts >= 5) {
    return { error: 'Demasiados intentos con este codigo. Solicita uno nuevo.' }
  }

  const expectedHash = hashOtp(email, 'email', code)

  if (!safeCompare(expectedHash, otp.codeHash)) {
    await prisma.registrationOtp.update({ data: { attempts: { increment: 1 } }, where: { id: otp.id } })
    return { error: 'Codigo de correo incorrecto' }
  }

  return { otpId: otp.id }
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) return forbiddenByCsrf()

  const rateLimit = checkRateLimit('register:' + getClientIp(request), 10, 60 * 60 * 1000)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Demasiados intentos de registro. Intenta mas tarde.' }, { status: 429 })
  }
  const body = (await request.json().catch(() => null)) as RegisterBody | null
  const name = body?.name?.trim() ?? ''
  const email = body?.email?.trim().toLowerCase() ?? ''
  const password = body?.password ?? ''
  const institution = body?.institution?.trim() || null
  const otpCode = body?.otpCode?.trim() ?? ''
  const phoneNumber = body?.phoneNumber?.trim() ? normalizePhoneNumber(body.phoneNumber.trim()) : null

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Nombre, correo y contrasena son obligatorios' }, { status: 400 })
  }

  if (body?.phoneNumber?.trim() && !phoneNumber) {
    return NextResponse.json({ error: 'Telefono de WhatsApp invalido' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'La contrasena debe tener al menos 6 caracteres' }, { status: 400 })
  }

  try {
    await ensureDatabase()
    const registrationContext = await getRegistrationContext()

    if (registrationContext.error) {
      return registrationContext.error
    }

    const { adminSession, userCount } = registrationContext

    if (!adminSession && !otpCode) {
      return sendOtpResponse(email)
    }

    let verifiedOtpId: number | null = null

    if (!adminSession) {
      const verification = await verifyOtp(email, otpCode)

      if ('error' in verification) {
        return NextResponse.json({ error: verification.error }, { status: 400 })
      }

      verifiedOtpId = verification.otpId
    }

    const user = await prisma.user.create({
      data: {
        email,
        institution,
        name,
        passwordHash: hashPassword(password),
        phoneNumber,
        role: userCount === 0 ? ADMIN_ROLE : INVESTIGATOR_ROLE
      },
      select: {
        email: true,
        id: true,
        name: true,
        phoneNumber: true,
        role: true
      }
    })

    if (verifiedOtpId) {
      await prisma.registrationOtp.update({
        data: {
          consumedAt: new Date(),
          userId: user.id
        },
        where: { id: verifiedOtpId }
      })
      await prisma.user.update({
        data: { emailVerifiedAt: new Date() },
        where: { id: user.id }
      })
    }

    const response = NextResponse.json({ ok: true, user })

    if (adminSession) {
      return response
    }

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



