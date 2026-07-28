const { PrismaClient } = require('@prisma/client')
const { assignIndividualMatchForPrisma } = require('./individual-matching-utils')

const prisma = new PrismaClient()

async function main() {
  const pageSize = Math.max(1, Number(process.env.INDIVIDUAL_BACKFILL_PAGE_SIZE || 100))
  let cursor = 0
  let processed = 0
  let matched = 0

  while (true) {
    const detections = await prisma.detection.findMany({
      where: { id: { gt: cursor }, individualId: null },
      orderBy: { id: 'asc' },
      take: pageSize,
      select: { id: true }
    })

    if (detections.length === 0) break

    for (const detection of detections) {
      cursor = detection.id
      processed += 1
      const result = await assignIndividualMatchForPrisma(prisma, detection.id).catch((error) => {
        console.error(`[backfill] No se pudo procesar deteccion ${detection.id}:`, error)
        return null
      })
      if (result?.individualId) matched += 1
    }

    console.log(`[backfill] procesadas=${processed} con_individuo=${matched} ultimo_id=${cursor}`)
  }

  console.log(`[backfill] terminado procesadas=${processed} con_individuo=${matched}`)
}

main()
  .catch((error) => {
    console.error('[backfill] error fatal:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
