import { prisma } from '@/lib/prisma'
import { ADMIN_ROLE } from '@/lib/auth'

let initialized = false

export async function ensureDatabase() {
  if (initialized) {
    return
  }

  const adminCount = await prisma.user.count({ where: { role: ADMIN_ROLE } })

  if (adminCount === 0) {
    const firstUser = await prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    })

    if (firstUser) {
      await prisma.user.update({
        where: { id: firstUser.id },
        data: { role: ADMIN_ROLE }
      })
    }
  }

  initialized = true
}

export async function seedDetectionsIfEmpty() {
  await ensureDatabase()
}
