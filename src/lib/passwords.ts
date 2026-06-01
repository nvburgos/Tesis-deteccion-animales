import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')

  return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedPassword: string) {
  const [salt, storedHash] = storedPassword.split(':')

  if (!salt || !storedHash) {
    return false
  }

  const hash = scryptSync(password, salt, KEY_LENGTH)
  const storedHashBuffer = Buffer.from(storedHash, 'hex')

  if (hash.length !== storedHashBuffer.length) {
    return false
  }

  return timingSafeEqual(hash, storedHashBuffer)
}
