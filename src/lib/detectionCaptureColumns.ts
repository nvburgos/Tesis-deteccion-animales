import { prisma } from './prisma'

let cachedHasCaptureColumns: boolean | null = null

export async function hasDetectionCaptureColumns() {
  if (cachedHasCaptureColumns !== null) {
    return cachedHasCaptureColumns
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Detection'
        AND column_name IN ('capturedAt', 'captureDateSource')
    `

    cachedHasCaptureColumns = Number(rows[0]?.count ?? 0) === 2
    return cachedHasCaptureColumns
  } catch (error) {
    console.error('No se pudo verificar columnas de captura en Detection:', error)
    cachedHasCaptureColumns = false
    return false
  }
}