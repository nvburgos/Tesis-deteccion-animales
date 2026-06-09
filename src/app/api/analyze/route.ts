import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ensureDatabase } from '@/lib/database'
import { calculatePriority } from '@/lib/detections'
import { prisma } from '@/lib/prisma'
import { AUTH_COOKIE, getSessionUserId } from '@/lib/auth'
import { createDetectionFromPrediction, runPrediction, saveUploadedImage } from '@/lib/predictionRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const session = (await cookies()).get(AUTH_COOKIE)?.value
    const userId = getSessionUserId(session)

    if (!userId) {
      return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 })
    }

    await ensureDatabase()

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'Sesion invalida' }, { status: 401 })
    }

    const formData = await request.formData()
    const image = formData.get('image')
    const location = String(formData.get('location') || 'Camara 01 | Zona Norte')

    if (!(image instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
    }

    const { diskPath, publicPath } = await saveUploadedImage(image)
    const prediction = await runPrediction(diskPath)

    if (prediction.error) {
      return NextResponse.json(
        {
          error: prediction.error,
          species: prediction.species,
          confidence: prediction.confidence,
          imagePath: publicPath,
          location,
          priority: calculatePriority(prediction.species, prediction.confidence),
          warning: prediction.warning,
          message: prediction.message
        },
        { status: 422 }
      )
    }

    const detection = await createDetectionFromPrediction({
      location,
      owner: user,
      prediction,
      publicPath
    })

    return NextResponse.json(detection)
  } catch (error) {
    console.error('Analyze API error:', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Error interno analizando la imagen'
      },
      { status: 500 }
    )
  }
}
