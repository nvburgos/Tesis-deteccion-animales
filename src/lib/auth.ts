import { createHmac, timingSafeEqual } from 'node:crypto'

export const AUTH_COOKIE = 'wildlife_session'
export const ADMIN_ROLE = 'Admin'
export const INVESTIGATOR_ROLE = 'Investigador'

function getAuthSecret() {
  return process.env.AUTH_SECRET || 'wildlife-local-development-secret'
}

function sign(value: string) {
  return createHmac('sha256', getAuthSecret()).update(value).digest('hex')
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function createSessionValue(userId: number) {
  const payload = String(userId)
  return `${payload}.${sign(payload)}`
}

export function getSessionUserId(value?: string) {
  if (!value) {
    return null
  }

  const [payload, signature] = value.split('.')

  if (!payload || !signature || !safeCompare(signature, sign(payload))) {
    return null
  }

  const userId = Number(payload)

  return Number.isInteger(userId) && userId > 0 ? userId : null
}

export function isValidSession(value?: string) {
  return getSessionUserId(value) !== null
}

export function isAdminRole(role?: string | null) {
  return role === ADMIN_ROLE
}
