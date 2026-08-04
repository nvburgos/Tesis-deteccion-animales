import { cookies } from 'next/headers'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { forbiddenByCsrf, verifySameOrigin } from '@/lib/requestSecurity'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

type SpeciesSummary = {
  firstReviewedAt: Date | null
  latestReviewedAt: Date | null
  minImagesForTraining: number
  sampleCount: number
  speciesId: number
  scientificName: string
  taxonomicGroup: string
}

export async function GET() {
  try {
    const session = (await cookies()).get(AUTH_COOKIE)?.value
    const userId = getSessionUserId(session)

    if (!userId) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })

    await ensureDatabase()

    const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!currentUser) return NextResponse.json({ error: 'Sesion invalida' }, { status: 401 })

    const [speciesRows, totalSamples, latestSamples, totalSpecies, trainableSpecies] = await Promise.all([
      prisma.species.findMany({
        where: { trainingSamples: { some: { status: 'trainable' } } },
        orderBy: { scientificName: 'asc' },
        select: {
          id: true,
          minImagesForTraining: true,
          scientificName: true,
          taxonomicGroup: true,
          trainingSamples: {
            where: { status: 'trainable' },
            orderBy: { createdAt: 'desc' },
            select: {
              createdAt: true
            }
          }
        }
      }),
      prisma.trainingSample.count({ where: { status: 'trainable' } }),
      prisma.trainingSample.findMany({
        where: { status: 'trainable' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          createdAt: true,
          id: true,
          label: true,
          detection: {
            select: {
              id: true,
              camera: { select: { code: true, name: true, zone: true } },
              capturedAt: true
            }
          },
          reviewedBy: { select: { name: true } },
          species: { select: { scientificName: true, taxonomicGroup: true } }
        }
      }),
      prisma.species.count(),
      prisma.species.count({ where: { isTrainable: true } })
    ])

    const bySpecies: SpeciesSummary[] = speciesRows.map((row) => {
      const dates = row.trainingSamples.map((sample) => sample.createdAt)
      return {
        firstReviewedAt: dates.at(-1) ?? null,
        latestReviewedAt: dates[0] ?? null,
        minImagesForTraining: row.minImagesForTraining,
        sampleCount: row.trainingSamples.length,
        speciesId: row.id,
        scientificName: row.scientificName,
        taxonomicGroup: row.taxonomicGroup
      }
    })
    const readySpecies = bySpecies.filter((row) => row.sampleCount >= row.minImagesForTraining)
    const almostReadySpecies = bySpecies.filter((row) => row.sampleCount > 0 && row.sampleCount < row.minImagesForTraining)
    const topSpecies = [...bySpecies].sort((left, right) => right.sampleCount - left.sampleCount || left.scientificName.localeCompare(right.scientificName)).slice(0, 20)
    const taxonomicGroups = bySpecies.reduce<Record<string, number>>((groups, row) => {
      groups[row.taxonomicGroup] = (groups[row.taxonomicGroup] ?? 0) + row.sampleCount
      return groups
    }, {})

    return NextResponse.json({
      latestSamples: latestSamples.map((sample) => ({
        camera: sample.detection.camera,
        capturedAt: sample.detection.capturedAt?.toISOString() ?? null,
        createdAt: sample.createdAt.toISOString(),
        detectionId: sample.detection.id,
        id: sample.id,
        label: sample.label,
        reviewedBy: sample.reviewedBy?.name ?? null,
        taxonomicGroup: sample.species.taxonomicGroup
      })),
      metrics: {
        almostReadySpecies: almostReadySpecies.length,
        readySpecies: readySpecies.length,
        totalSamples,
        totalSpecies,
        trainableSpecies
      },
      species: topSpecies.map((row) => ({
        ...row,
        firstReviewedAt: row.firstReviewedAt?.toISOString() ?? null,
        latestReviewedAt: row.latestReviewedAt?.toISOString() ?? null,
        missingForTraining: Math.max(0, row.minImagesForTraining - row.sampleCount),
        readyForTraining: row.sampleCount >= row.minImagesForTraining
      })),
      taxonomicGroups
    })
  } catch (error) {
    console.error('GET /api/datasets/training error:', error)
    return NextResponse.json({ error: 'No se pudo cargar el resumen del dataset' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return forbiddenByCsrf()

  try {
    const session = (await cookies()).get(AUTH_COOKIE)?.value
    const userId = getSessionUserId(session)

    if (!userId) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })

    await ensureDatabase()

    const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
    if (!currentUser) return NextResponse.json({ error: 'Sesion invalida' }, { status: 401 })
    if (!isAdminRole(currentUser.role)) return NextResponse.json({ error: 'Solo un administrador puede preparar el dataset' }, { status: 403 })

    const body = (await request.json().catch(() => null)) as { minPerSpecies?: number } | null
    const minPerSpecies = Math.max(2, Math.min(200, Number(body?.minPerSpecies ?? 2) || 2))
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['scripts/build-training-dataset.js', '--min-per-species', String(minPerSpecies)],
      {
        cwd: process.cwd(),
        env: process.env,
        timeout: 120000,
        windowsHide: true
      }
    ).catch((error: unknown) => {
      if (error && typeof error === 'object' && 'stdout' in error) {
        return {
          stderr: String((error as { stderr?: unknown }).stderr ?? ''),
          stdout: String((error as { stdout?: unknown }).stdout ?? '')
        }
      }
      throw error
    })

    const parsed = JSON.parse(String(stdout || '{}')) as Record<string, unknown>
    const ok = typeof parsed.prepared === 'number' && parsed.prepared > 0
    return NextResponse.json({ ok, result: parsed, stderr: String(stderr || '') })
  } catch (error) {
    console.error('POST /api/datasets/training error:', error)
    return NextResponse.json({ error: 'No se pudo preparar el dataset de entrenamiento' }, { status: 500 })
  }
}
