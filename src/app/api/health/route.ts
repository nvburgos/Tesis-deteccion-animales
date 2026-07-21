import { existsSync } from 'node:fs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { getStorageRoot } from '@/lib/fileStorage'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export async function GET() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })

  await ensureDatabase()

  const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!isAdminRole(currentUser?.role)) return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 })

  const staleMinutes = parsePositiveInt(process.env.BATCH_STALE_MINUTES, 15)
  const heartbeatCutoff = new Date(Date.now() - staleMinutes * 60 * 1000)
  const storageRootExists = existsSync(getStorageRoot())

  const [databaseCheck, failedMigrations, recentWorker, pendingBatches, processingBatches] = await Promise.all([
    prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
    prisma.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`,
    prisma.batchJob.findFirst({
      orderBy: { heartbeatAt: 'desc' },
      select: { heartbeatAt: true, id: true, status: true, workerId: true },
      where: { status: 'Procesando', heartbeatAt: { gte: heartbeatCutoff } }
    }),
    prisma.batchJob.count({ where: { status: 'Pendiente' } }),
    prisma.batchJob.count({ where: { status: 'Procesando' } })
  ])

  const databaseOk = databaseCheck[0]?.ok === 1
  const migrationsOk = failedMigrations.length === 0

  return NextResponse.json({
    ok: databaseOk && migrationsOk,
    checks: {
      next: 'ok',
      postgres: databaseOk ? 'ok' : 'error',
      migrations: migrationsOk ? 'ok' : 'error',
      storage: storageRootExists ? 'ok' : 'missing',
      worker: recentWorker ? 'active' : 'no_recent_heartbeat'
    },
    worker: recentWorker
      ? {
          batchId: recentWorker.id,
          heartbeatAt: recentWorker.heartbeatAt?.toISOString() ?? null,
          status: recentWorker.status,
          workerId: recentWorker.workerId
        }
      : null,
    batches: {
      pending: pendingBatches,
      processing: processingBatches
    }
  })
}