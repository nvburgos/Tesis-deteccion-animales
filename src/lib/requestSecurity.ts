import { NextResponse } from 'next/server'

function getRequestOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (origin) return origin

  const referer = request.headers.get('referer')
  if (!referer) return null

  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

export function verifySameOrigin(request: Request) {
  const requestOrigin = getRequestOrigin(request)
  if (!requestOrigin) return true

  const host = request.headers.get('host')
  if (!host) return false

  const protocol = request.headers.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const expectedOrigin = `${protocol}://${host}`
  return requestOrigin === expectedOrigin
}

export function forbiddenByCsrf() {
  return NextResponse.json({ error: 'Solicitud rechazada por verificacion de origen' }, { status: 403 })
}
