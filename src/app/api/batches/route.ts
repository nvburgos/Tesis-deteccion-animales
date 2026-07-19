import { exec } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { sanitizeFilename } from '@/lib/predictionRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execAsync = promisify(exec)
const imageExtensionPattern = '\\.(jpg|jpeg|png|webp|bmp)$'

function quotePowerShellLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
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

async function countZipImages(zipPath: string) {
  const command = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$zip = [System.IO.Compression.ZipFile]::OpenRead(${quotePowerShellLiteral(zipPath)})`,
    'try {',
    `  ($zip.Entries | Where-Object { $_.FullName -match ${quotePowerShellLiteral(imageExtensionPattern)} }).Count`,
    '} finally {',
    '  $zip.Dispose()',
    '}'
  ].join('; ')
  const { stdout } = await execAsync(`powershell -NoProfile -Command "${command}"`, { timeout: 120000 })
  const count = Number(stdout.trim())

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
  const isAdmin = isAdminRole(currentUser.role)
  const where: Prisma.BatchJobWhereInput = isAdmin ? {} : { userId: currentUser.id }

  if (Number.isInteger(cameraId) && cameraId > 0) {
    where.cameraId = cameraId
  }

  const jobs = await prisma.batchJob.findMany({
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
    where
  })

  return NextResponse.json({
    jobs: jobs.map(toPublicBatchJob)
  })
}

export async function POST(request: NextRequest) {
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

  const batchRoot = path.join(process.cwd(), 'public', 'uploads', 'batches', String(job.id))
  const zipPath = path.join(batchRoot, job.zipName)

  try {
    await mkdir(batchRoot, { recursive: true })
    await writeFile(zipPath, Buffer.from(await zip.arrayBuffer()))

    const totalImages = await countZipImages(zipPath)
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
