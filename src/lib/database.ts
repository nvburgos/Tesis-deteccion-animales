import { prisma } from '@/lib/prisma'
import { ADMIN_ROLE } from '@/lib/auth'

let initialized = false

export async function ensureDatabase() {
  if (initialized) {
    return
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Detection" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "imagePath" TEXT NOT NULL,
      "species" TEXT NOT NULL,
      "confidence" REAL NOT NULL,
      "location" TEXT NOT NULL,
      "priority" TEXT NOT NULL,
      "userId" INTEGER,
      "x1" REAL,
      "y1" REAL,
      "x2" REAL,
      "y2" REAL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "institution" TEXT,
      "role" TEXT NOT NULL DEFAULT 'Investigador',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
  `)

  const detectionColumns = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("Detection");`)
  const hasUserId = detectionColumns.some((column) => column.name === 'userId')

  if (!hasUserId) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Detection" ADD COLUMN "userId" INTEGER;`)
  }

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Detection_userId_idx" ON "Detection"("userId");
  `)

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
