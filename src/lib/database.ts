import { calculatePriority } from '@/lib/detections'
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

  const total = await prisma.detection.count()

  if (total > 0) {
    return
  }

  await prisma.detection.createMany({
    data: [
      {
        imagePath: '',
        species: 'Jaguar',
        confidence: 96,
        location: 'Camara 01 | Zona Norte',
        priority: calculatePriority('Jaguar', 96),
        x1: 112,
        y1: 84,
        x2: 420,
        y2: 360,
        createdAt: new Date(Date.now() - 8 * 60 * 1000)
      },
      {
        imagePath: '',
        species: 'Venado Cola Blanca',
        confidence: 92,
        location: 'Camara 04 | Sendero Este',
        priority: calculatePriority('Venado Cola Blanca', 92),
        x1: 140,
        y1: 92,
        x2: 410,
        y2: 340,
        createdAt: new Date(Date.now() - 24 * 60 * 1000)
      },
      {
        imagePath: '',
        species: 'Tapir Amazonico',
        confidence: 89,
        location: 'Camara 07 | Humedal Central',
        priority: calculatePriority('Tapir Amazonico', 89),
        x1: 96,
        y1: 78,
        x2: 390,
        y2: 332,
        createdAt: new Date(Date.now() - 60 * 60 * 1000)
      }
    ]
  })
}
