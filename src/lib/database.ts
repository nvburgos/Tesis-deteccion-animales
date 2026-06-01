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

  initialized = true
}

export async function seedDetectionsIfEmpty() {
  await ensureDatabase()
}
