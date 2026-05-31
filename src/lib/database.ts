import { prisma } from '@/lib/prisma'

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
      "x1" REAL,
      "y1" REAL,
      "x2" REAL,
      "y2" REAL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  initialized = true
}

export async function seedDetectionsIfEmpty() {
  await ensureDatabase()
}
