import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE } from '@/lib/auth'
import { forbiddenByCsrf, verifySameOrigin } from '@/lib/requestSecurity'

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return forbiddenByCsrf()

  const response = NextResponse.json({ ok: true })
  response.cookies.delete(AUTH_COOKIE)

  return response
}
