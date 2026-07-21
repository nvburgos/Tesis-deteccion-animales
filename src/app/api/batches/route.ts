import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { forbiddenByCsrf, verifySameOrigin } from '@/lib/requestSecurity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)
function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase()
}


function getStorageRoot() {
  return path.resolve(process.env.STORAGE_ROOT || path.join(/*turbopackIgnore: true*/ process.cwd(), 'storage'))
}

async function getCurrentUser() {
  const session = (await cookies()).get(AUTH_COOKIE)?.value
  const userId = getSessionUserId(session)

  if (!userId) {
    return null
  }

  await ensureDatabase()

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true }
  })
}

async function inspectZip(zipPath: string) {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const { stdout } = await execFileAsync(pythonBin, [path.join(/*turbopackIgnore: true*/ process.cwd(), 'python', 'safe_zip.py'), 'inspect', zipPath], {
    env: process.env,
    timeout: 120000
  })
  const data = JSON.parse(stdout.trim()) as { imageCount?: number }
  const count = Number(data.imageCount ?? 0)
  return Number.isFinite(count) && count >= 0 ? count : 0
}

function toPublicBatchJob(job: {
  id: number
  zipName: string
  status: string
  totalImages: number
  processedImages: number
  failedImages: number
  error: string | null
  cameraId: number | null
  createdAt: Date
  completedAt: Date | null
  camera?: {
    id: number
    code: string
    name: string
    zone: string
  } | null
  user?: {
    id: number
    name: string
    email: string
  } | null
}) {
  return {
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    error: job.error,
    failedImages: job.failedImages,
    id: job.id,
    cameraId: job.cameraId,
    camera: job.camera ?? null,
    processedImages: job.processedImages,
    researcher: job.user?.name ?? null,
    researcherEmail: job.user?.email ?? null,
    status: job.status,
    totalImages: job.totalImages,
    zipName: job.zipName
  }
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  const cameraId = Number(request.nextUrl.searchParams.get('cameraId') ?? '')
  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? '1') || 1)
  const pageSize = Math.min(100, Math.max(10, Number(request.nextUrl.searchParams.get('pageSize') ?? '50') || 50))
  const isAdmin = isAdminRole(currentUser.role)
  const where: Prisma.BatchJobWhereInput = isAdmin ? {} : { userId: currentUser.id }

  if (Number.isInteger(cameraId) && cameraId > 0) {
    where.cameraId = cameraId
  }

  const [total, jobs] = await Promise.all([
    prisma.batchJob.count({ where }),
    prisma.batchJob.findMany({
      include: {
        camera: {
          select: {
            code: true,
            id: true,
            name: true,
            zone: true
          }
        },
        user: {
          select: {
            email: true,
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      where
    })
  ])

  return NextResponse.json({
    jobs: jobs.map(toPublicBatchJob),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  })
}

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return forbiddenByCsrf()

  const rateLimit = checkRateLimit('batch:' + getClientIp(request), 20, 60 * 60 * 1000)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Demasiadas cargas de ZIP. Intenta mas tarde.' }, { status: 429 })
  }
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
  }

  const formData = await request.formData()
  const zip = formData.get('zip')
  const cameraId = Number(formData.get('cameraId') ?? '')

  if (!(zip instanceof File) || !zip.name.toLowerCase().endsWith('.zip')) {
    return NextResponse.json({ error: 'Debes subir un archivo .zip' }, { status: 400 })
  }

  if (!Number.isInteger(cameraId) || cameraId <= 0) {
    return NextResponse.json({ error: 'Camara requerida' }, { status: 400 })
  }

  const camera = await prisma.camera.findFirst({
    where: { id: cameraId, active: true },
    select: {
      code: true,
      id: true,
      name: true,
      zone: true
    }
  })

  if (!camera) {
    return NextResponse.json({ error: 'Camara no encontrada' }, { status: 404 })
  }

  const job = await prisma.batchJob.create({
    data: {
      cameraId: camera.id,
      status: 'Pendiente',
      userId: currentUser.id,
      zipName: sanitizeFilename(zip.name || 'imagenes.zip')
    },
    include: {
      camera: { select: { code: true, id: true, name: true, zone: true } },
      user: { select: { email: true, id: true, name: true } }
    }
  })

  const batchRoot = path.join(getStorageRoot(), 'uploads', 'batches', String(job.id))
  const zipPath = path.join(batchRoot, job.zipName)

  try {
    await mkdir(batchRoot, { recursive: true })
    await writeFile(zipPath, Buffer.from(await zip.arrayBuffer()))

    const totalImages = await inspectZip(zipPath)
    const updatedJob = await prisma.batchJob.update({
      data: { totalImages },
      include: {
        camera: { select: { code: true, id: true, name: true, zone: true } },
        user: { select: { email: true, id: true, name: true } }
      },
      where: { id: job.id }
    })

    return NextResponse.json(
      {
        batchId: updatedJob.id,
        job: toPublicBatchJob(updatedJob),
        status: updatedJob.status,
        totalImages: updatedJob.totalImages
      },
      { status: 202 }
    )
  } catch (error) {
    await prisma.batchJob.update({
      data: {
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'ZIP invalido',
        status: 'Con errores'
      },
      where: { id: job.id }
    })

    return NextResponse.json({ error: 'No se pudo registrar el ZIP' }, { status: 400 })
  }
}





