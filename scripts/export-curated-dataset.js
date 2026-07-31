const { copyFile, mkdir, writeFile } = require('node:fs/promises')
const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')
const { PrismaClient } = require('@prisma/client')

function loadDotenv() {
  const envPath = path.join(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [key, ...valueParts] = trimmed.split('=')
    const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadDotenv()

const prisma = new PrismaClient()
const curatedStatuses = ['Confirmada', 'Corregida']

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function getStorageRoot() {
  return path.resolve(process.env.STORAGE_ROOT || path.join(process.cwd(), 'storage'))
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveStoredDetectionPath(imagePath) {
  const storageRoot = getStorageRoot()
  const publicUploadsRoot = path.resolve(process.cwd(), 'public', 'uploads')
  const normalized = imagePath.replace(/\\/g, '/')
  const candidates = []

  if (normalized.startsWith('/uploads/')) {
    candidates.push(path.resolve(process.cwd(), 'public', normalized.slice(1)))
    candidates.push(path.resolve(storageRoot, normalized.slice('/'.length)))
  } else if (normalized.startsWith('uploads/')) {
    candidates.push(path.resolve(storageRoot, normalized))
    candidates.push(path.resolve(process.cwd(), 'public', normalized))
  } else if (!path.isAbsolute(normalized) && !normalized.split('/').includes('..')) {
    candidates.push(path.resolve(storageRoot, normalized))
  }

  return candidates.find((candidate) => {
    const inStorage = isInside(storageRoot, candidate)
    const inPublicUploads = isInside(publicUploadsRoot, candidate)
    return (inStorage || inPublicUploads) && existsSync(candidate)
  }) || null
}

function sanitizeSegment(value) {
  return String(value || 'sin-etiqueta')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '-')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 90) || 'sin-etiqueta'
}

function escapeCsv(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function datasetLabel(detection) {
  return detection.manualCorrectedSpecies?.trim() || detection.species
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.resolve(argValue('--out') || path.join(getStorageRoot(), 'exports', `curated-dataset-${timestamp}`))
  const limit = Number(argValue('--limit') || '')
  const cameraId = Number(argValue('--camera-id') || '')
  const dryRun = hasFlag('--dry-run')
  const where = {
    manualReviewStatus: { in: curatedStatuses },
    manualReviewedAt: { not: null }
  }

  if (Number.isInteger(cameraId) && cameraId > 0) {
    where.cameraId = cameraId
  }

  const detections = await prisma.detection.findMany({
    where,
    orderBy: [{ manualReviewedAt: 'desc' }, { id: 'asc' }],
    take: Number.isInteger(limit) && limit > 0 ? limit : undefined,
    select: {
      id: true,
      imagePath: true,
      species: true,
      confidence: true,
      capturedAt: true,
      cameraTrapCode: true,
      manualOriginalSpecies: true,
      manualCorrectedSpecies: true,
      manualReviewStatus: true,
      manualReviewedAt: true,
      camera: { select: { code: true, id: true, name: true, zone: true } },
      reviewedBy: { select: { email: true, id: true, name: true } }
    }
  })
  const manifest = []
  let copied = 0
  let missing = 0

  if (!dryRun) {
    await mkdir(outDir, { recursive: true })
  }

  for (const detection of detections) {
    const label = datasetLabel(detection)
    const sourcePath = resolveStoredDetectionPath(detection.imagePath)

    if (!sourcePath) {
      missing += 1
      console.warn(`[dataset] archivo no encontrado detection=${detection.id} path=${detection.imagePath}`)
      continue
    }

    const labelDir = sanitizeSegment(label)
    const extension = path.extname(sourcePath) || '.jpg'
    const filename = `detection-${detection.id}${extension.toLowerCase()}`
    const relativePath = path.join(labelDir, filename).replace(/\\/g, '/')
    const targetPath = path.join(outDir, labelDir, filename)

    if (!dryRun) {
      await mkdir(path.dirname(targetPath), { recursive: true })
      await copyFile(sourcePath, targetPath)
    }

    manifest.push({
      detectionId: detection.id,
      file: relativePath,
      label,
      originalPrediction: detection.manualOriginalSpecies || detection.species,
      correctedSpecies: detection.manualCorrectedSpecies || '',
      confidence: Math.round(detection.confidence),
      reviewStatus: detection.manualReviewStatus || '',
      reviewedAt: detection.manualReviewedAt?.toISOString() || '',
      reviewedBy: detection.reviewedBy?.email || detection.reviewedBy?.name || '',
      cameraCode: detection.camera?.code || '',
      cameraTrapCode: detection.cameraTrapCode || '',
      capturedAt: detection.capturedAt?.toISOString() || ''
    })
    copied += 1
  }

  const headers = ['detection_id', 'file', 'label', 'original_prediction', 'corrected_species', 'confidence', 'review_status', 'reviewed_at', 'reviewed_by', 'camera_code', 'camera_trap_code', 'captured_at']
  const rows = manifest.map((row) => [
    row.detectionId,
    row.file,
    row.label,
    row.originalPrediction,
    row.correctedSpecies,
    row.confidence,
    row.reviewStatus,
    row.reviewedAt,
    row.reviewedBy,
    row.cameraCode,
    row.cameraTrapCode,
    row.capturedAt
  ])
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')

  if (!dryRun) {
    await writeFile(path.join(outDir, 'manifest.csv'), csv, 'utf8')
    await writeFile(path.join(outDir, 'dataset.json'), JSON.stringify({ generatedAt: new Date().toISOString(), total: manifest.length, items: manifest }, null, 2), 'utf8')
  }

  console.log(JSON.stringify({ copied, dryRun, missing, outDir, reviewed: detections.length }, null, 2))
}

main()
  .catch((error) => {
    console.error('[dataset] error fatal:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
