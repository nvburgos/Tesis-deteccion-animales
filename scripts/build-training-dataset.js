const { copyFile, mkdir, rm, writeFile } = require('node:fs/promises')
const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { PrismaClient } = require('@prisma/client')

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])

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

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
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
    return (inStorage || inPublicUploads) && existsSync(candidate) && imageExtensions.has(path.extname(candidate).toLowerCase())
  }) || null
}

function sanitizeFilename(value) {
  return String(value || 'sample')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || 'sample'
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function yoloBox(sample, width, height) {
  const detection = sample.detection
  const x1 = Number(detection.x1)
  const y1 = Number(detection.y1)
  const x2 = Number(detection.x2)
  const y2 = Number(detection.y2)

  if (![x1, y1, x2, y2, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null
  }

  const left = clamp(Math.min(x1, x2), 0, width)
  const top = clamp(Math.min(y1, y2), 0, height)
  const right = clamp(Math.max(x1, x2), 0, width)
  const bottom = clamp(Math.max(y1, y2), 0, height)
  const boxWidth = right - left
  const boxHeight = bottom - top

  if (boxWidth < 2 || boxHeight < 2) return null

  return {
    centerX: ((left + boxWidth / 2) / width).toFixed(6),
    centerY: ((top + boxHeight / 2) / height).toFixed(6),
    height: (boxHeight / height).toFixed(6),
    width: (boxWidth / width).toFixed(6)
  }
}

function splitForIndex(index, total) {
  if (total < 3) return index === 0 ? 'train' : 'valid'
  const ratio = index / total
  if (ratio < 0.8) return 'train'
  if (ratio < 0.9) return 'valid'
  return 'test'
}

async function resetDataset(outputRoot) {
  await rm(outputRoot, { recursive: true, force: true })
  for (const split of ['train', 'valid', 'test']) {
    await mkdir(path.join(outputRoot, split, 'images'), { recursive: true })
    await mkdir(path.join(outputRoot, split, 'labels'), { recursive: true })
  }
}

function dataYaml(classNames) {
  const lines = [
    'train: train/images',
    'val: valid/images',
    'test: test/images',
    '',
    `nc: ${classNames.length}`,
    '',
    'names:'
  ]

  classNames.forEach((name, index) => {
    lines.push(`  ${index}: ${JSON.stringify(name)}`)
  })

  return `${lines.join('\n')}\n`
}

loadDotenv()

const prisma = new PrismaClient()

async function main() {
  const outputRoot = path.resolve(argValue('--out', path.join(process.cwd(), 'python', 'dataset')))
  const minSamplesPerSpecies = Math.max(2, Number(argValue('--min-per-species', process.env.TRAINING_MIN_SAMPLES_PER_SPECIES || '2')) || 2)
  const dryRun = hasFlag('--dry-run')
  const samples = await prisma.trainingSample.findMany({
    where: { status: 'trainable' },
    orderBy: [{ speciesId: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      imagePath: true,
      label: true,
      species: { select: { id: true, scientificName: true, minImagesForTraining: true } },
      detection: {
        select: {
          id: true,
          x1: true,
          y1: true,
          x2: true,
          y2: true
        }
      }
    }
  })
  const bySpecies = new Map()

  for (const sample of samples) {
    const list = bySpecies.get(sample.species.scientificName) ?? []
    list.push(sample)
    bySpecies.set(sample.species.scientificName, list)
  }

  const eligibleEntries = Array.from(bySpecies.entries())
    .filter(([, list]) => list.length >= minSamplesPerSpecies)
    .sort(([left], [right]) => left.localeCompare(right))

  if (eligibleEntries.length === 0) {
    console.log(JSON.stringify({
      dryRun,
      eligibleSpecies: 0,
      message: `No hay especies con al menos ${minSamplesPerSpecies} muestras curadas.`,
      outputRoot,
      totalSamples: samples.length
    }, null, 2))
    process.exitCode = 1
    return
  }

  if (!dryRun) await resetDataset(outputRoot)

  const classNames = eligibleEntries.map(([speciesName]) => speciesName)
  const classIds = new Map(classNames.map((name, index) => [name, index]))
  const manifest = []
  const skipped = []
  const splitCounts = { test: 0, train: 0, valid: 0 }

  for (const [speciesName, speciesSamples] of eligibleEntries) {
    for (let index = 0; index < speciesSamples.length; index += 1) {
      const sample = speciesSamples[index]
      const sourcePath = resolveStoredDetectionPath(sample.imagePath)

      if (!sourcePath) {
        skipped.push({ reason: 'missing_image', sampleId: sample.id })
        continue
      }

      const metadata = await sharp(sourcePath).metadata().catch(() => null)
      const box = metadata?.width && metadata?.height ? yoloBox(sample, metadata.width, metadata.height) : null

      if (!box) {
        skipped.push({ reason: 'missing_or_invalid_box', sampleId: sample.id })
        continue
      }

      const split = splitForIndex(index, speciesSamples.length)
      const extension = path.extname(sourcePath).toLowerCase() || '.jpg'
      const filename = `${sanitizeFilename(speciesName)}-sample-${sample.id}-detection-${sample.detection.id}${extension}`
      const imageTarget = path.join(outputRoot, split, 'images', filename)
      const labelTarget = path.join(outputRoot, split, 'labels', `${path.basename(filename, extension)}.txt`)
      const classId = classIds.get(speciesName)
      const label = `${classId} ${box.centerX} ${box.centerY} ${box.width} ${box.height}\n`

      if (!dryRun) {
        await copyFile(sourcePath, imageTarget)
        await writeFile(labelTarget, label, 'utf8')
      }

      splitCounts[split] += 1
      manifest.push({
        classId,
        detectionId: sample.detection.id,
        file: path.relative(outputRoot, imageTarget).replace(/\\/g, '/'),
        label,
        sampleId: sample.id,
        species: speciesName,
        split
      })
    }
  }

  if (manifest.length === 0) {
    console.log(JSON.stringify({ dryRun, eligibleSpecies: eligibleEntries.length, message: 'No se pudo preparar ninguna muestra valida.', outputRoot, skipped }, null, 2))
    process.exitCode = 1
    return
  }

  if (!dryRun) {
    await writeFile(path.join(outputRoot, 'data.yaml'), dataYaml(classNames), 'utf8')
    await writeFile(path.join(outputRoot, 'training-manifest.json'), JSON.stringify({ classNames, generatedAt: new Date().toISOString(), items: manifest, skipped, splitCounts }, null, 2), 'utf8')
  }

  console.log(JSON.stringify({
    classes: classNames.length,
    dryRun,
    outputRoot,
    prepared: manifest.length,
    skipped: skipped.length,
    splitCounts
  }, null, 2))
}

main()
  .catch((error) => {
    console.error('[training-dataset] error fatal:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
