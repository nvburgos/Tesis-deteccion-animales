import { readFile } from 'node:fs/promises'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { AUTH_COOKIE, getSessionUserId, isAdminRole } from '@/lib/auth'
import { ensureDatabase } from '@/lib/database'
import { getContentType, resolveStoredDetectionPath } from '@/lib/fileStorage'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function getDetectionId(context: { params: Promise<{ detectionId: string }> }) {
  const { detectionId } = await context.params
  const id = Number(detectionId)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(_request: Request, context: { params: Promise<{ detectionId: string }> }) {
  try {
    const session = (await cookies()).get(AUTH_COOKIE)?.value
    const userId = getSessionUserId(session)

    if (!userId) {
      return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
    }

    const detectionId = await getDetectionId(context)
    if (!detectionId) {
      return NextResponse.json({ error: 'Archivo invalido' }, { status: 400 })
    }

    await ensureDatabase()

    const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
    if (!currentUser) {
      return NextResponse.json({ error: 'Sesion invalida' }, { status: 401 })
    }

    const detection = await prisma.detection.findFirst({
      where: { id: detectionId, ...(isAdminRole(currentUser.role) ? {} : { OR: [{ userId: currentUser.id }, { batchJob: { userId: currentUser.id } }] }) },
      select: { imagePath: true }
    })

    if (!detection) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
    }

    const filePath = resolveStoredDetectionPath(detection.imagePath)
    if (!filePath) {
      return NextResponse.json({ error: 'Archivo no disponible' }, { status: 404 })
    }

    const file = await readFile(filePath)
    return new NextResponse(file, {
      headers: {
        'Cache-Control': 'private, max-age=300, no-transform',
        'Content-Type': getContentType(filePath),
        'X-Content-Type-Options': 'nosniff'
      }
    })
  } catch (error) {
    console.error('GET /api/files/[detectionId] error:', error)
    return NextResponse.json({ error: 'No se pudo cargar el archivo' }, { status: 500 })
  }
}
