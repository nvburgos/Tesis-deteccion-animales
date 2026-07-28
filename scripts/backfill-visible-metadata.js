const { execFile } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')
const { promisify } = require('node:util')
const { PrismaClient } = require('@prisma/client')

const execFileAsync = promisify(execFile)

function loadDotenv() {
  const envPath = path.join(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  const content = require('node:fs').readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [key, ...valueParts] = trimmed.split('=')
    const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadDotenv()

const prisma = new PrismaClient()

function getStorageRoot() {
  return path.resolve(process.env.STORAGE_ROOT || path.join(process.cwd(), 'storage'))
}

function resolveImagePath(imagePath) {
  if (!imagePath) return null
  const normalized = imagePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const candidates = [
    path.join(getStorageRoot(), normalized),
    path.join(process.cwd(), normalized),
    path.join(process.cwd(), 'public', normalized)
  ]

  return candidates.find((candidate) => existsSync(candidate)) || null
}

async function extractMetadata(imagePath) {
  const pythonBin = process.env.PYTHON_BIN || 'python'
  const scriptPath = path.join(process.cwd(), 'python', 'extract_capture_metadata.py')
  const { stdout } = await execFileAsync(pythonBin, [scriptPath, imagePath], {
    env: process.env,
    timeout: Number(process.env.CAPTURE_METADATA_BACKFILL_TIMEOUT_MS || 30000)
  })

  return JSON.parse(stdout)
}

async function main() {
  const pageSize = Math.max(1, Number(process.env.VISIBLE_METADATA_BACKFILL_PAGE_SIZE || 50))
  const force = String(process.env.VISIBLE_METADATA_BACKFILL_FORCE || '').trim().toLowerCase() === '1'
  let cursor = Math.max(0, Number(process.env.VISIBLE_METADATA_BACKFILL_AFTER_ID || 0))
  let processed = 0
  let updated = 0
  let missingFile = 0

  while (true) {
    const detections = await prisma.detection.findMany({
      where: force ? { id: { gt: cursor } } : { id: { gt: cursor }, visibleMetadataText: null },
      orderBy: { id: 'asc' },
      take: pageSize,
      select: { id: true, imagePath: true }
    })

    if (detections.length === 0) break

    for (const detection of detections) {
      cursor = detection.id
      processed += 1
      const resolvedPath = resolveImagePath(detection.imagePath)

      if (!resolvedPath) {
        missingFile += 1
        console.warn(`[metadata-backfill] archivo no encontrado detection=${detection.id} path=${detection.imagePath}`)
        continue
      }

      const metadata = await extractMetadata(resolvedPath).catch((error) => {
        console.error(`[metadata-backfill] OCR fallo detection=${detection.id}:`, error)
        return null
      })

      if (!metadata) continue

      await prisma.detection.update({
        where: { id: detection.id },
        data: {
          capturedAt: metadata.capturedAt ? new Date(metadata.capturedAt) : undefined,
          captureDateSource: metadata.captureDateSource || undefined,
          cameraTrapCode: metadata.cameraTrapCode || null,
          temperatureCelsius: typeof metadata.temperatureCelsius === 'number' ? metadata.temperatureCelsius : null,
          temperatureFahrenheit: typeof metadata.temperatureFahrenheit === 'number' ? metadata.temperatureFahrenheit : null,
          visibleMetadataText: metadata.visibleMetadataText || 'OCR: sin texto detectable'
        }
      })
      updated += 1
    }

    console.log(`[metadata-backfill] procesadas=${processed} actualizadas=${updated} faltantes=${missingFile} ultimo_id=${cursor}`)
  }

  console.log(`[metadata-backfill] terminado procesadas=${processed} actualizadas=${updated} faltantes=${missingFile}`)
}

main()
  .catch((error) => {
    console.error('[metadata-backfill] error fatal:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
