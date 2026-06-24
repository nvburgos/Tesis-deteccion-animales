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
      "batchJobId" INTEGER,
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
    CREATE TABLE IF NOT EXISTS "BatchJob" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "zipName" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'Pendiente',
      "totalImages" INTEGER NOT NULL DEFAULT 0,
      "processedImages" INTEGER NOT NULL DEFAULT 0,
      "failedImages" INTEGER NOT NULL DEFAULT 0,
      "error" TEXT,
      "userId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" DATETIME
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

  const hasBatchJobId = detectionColumns.some((column) => column.name === 'batchJobId')

  if (!hasBatchJobId) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Detection" ADD COLUMN "batchJobId" INTEGER;`)
  }

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Detection_userId_idx" ON "Detection"("userId");
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Detection_batchJobId_idx" ON "Detection"("batchJobId");
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "BatchJob_userId_idx" ON "BatchJob"("userId");
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
