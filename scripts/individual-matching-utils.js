const { compareDetectionCrops } = require('./visual-signature-utils')
const { existsSync } = require('node:fs')
const path = require('node:path')

const genericIndividualSpeciesPatterns = [
  /\bfamily\b/i,
  /\bspecies\b/i,
  /\bmammal\b/i,
  /\banimal\b/i,
  /\bbird\b/i,
  /\brodent\b/i,
  /\breptile\b/i,
  /\bunknown\b/i
]

const invalidIndividualSpecies = new Set([
  '',
  'imagen no evaluable',
  'no cv result',
  'sin deteccion',
  'sin detección',
  'unknown'
])

function normalizeSpeciesName(species) {
  return String(species || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function isEligibleForIndividualMatching(species, confidence) {
  const normalized = normalizeSpeciesName(species)

  if (invalidIndividualSpecies.has(normalized) || confidence <= 0) {
    return false
  }

  return !genericIndividualSpeciesPatterns.some((pattern) => pattern.test(species))
}

function getCaptureDate(detection) {
  return detection.capturedAt || detection.createdAt
}

function haversineKm(first, second) {
  const earthRadiusKm = 6371
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(second.latitude - first.latitude)
  const deltaLng = toRadians(second.longitude - first.longitude)
  const firstLat = toRadians(first.latitude)
  const secondLat = toRadians(second.latitude)
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.sin(deltaLng / 2) ** 2 * Math.cos(firstLat) * Math.cos(secondLat)

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(distanceKm) {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`
  return `${distanceKm.toFixed(1)} km`
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
  const normalized = String(imagePath || '').replace(/\\/g, '/')
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

function scoreIndividualCandidate(detection, candidate) {
  const basis = ['misma especie']
  let score = 25
  const hours = Math.abs(getCaptureDate(detection).getTime() - getCaptureDate(candidate).getTime()) / 36e5

  if (detection.cameraId && candidate.cameraId && detection.cameraId === candidate.cameraId) {
    if (hours <= 0.5) score += 18
    else if (hours <= 6) score += 12
    else if (hours <= 24) score += 7
    else score += 4
    basis.push(hours <= 24 ? 'misma camara en intervalo corto' : 'misma camara')
  } else if (detection.cameraTrapCode && candidate.cameraTrapCode && detection.cameraTrapCode === candidate.cameraTrapCode) {
    if (hours <= 0.5) score += 16
    else if (hours <= 6) score += 10
    else if (hours <= 24) score += 6
    else score += 3
    basis.push(hours <= 24 ? `mismo codigo visible de camara ${detection.cameraTrapCode} en intervalo corto` : `mismo codigo visible de camara ${detection.cameraTrapCode}`)
  } else if (
    detection.camera?.latitude !== null &&
    detection.camera?.latitude !== undefined &&
    detection.camera?.longitude !== null &&
    detection.camera?.longitude !== undefined &&
    candidate.camera?.latitude !== null &&
    candidate.camera?.latitude !== undefined &&
    candidate.camera?.longitude !== null &&
    candidate.camera?.longitude !== undefined
  ) {
    const distanceKm = haversineKm(
      { latitude: detection.camera.latitude, longitude: detection.camera.longitude },
      { latitude: candidate.camera.latitude, longitude: candidate.camera.longitude }
    )

    basis.push(`distancia ${formatDistance(distanceKm)}`)

    if (distanceKm <= 0.25) score += hours <= 24 ? 16 : 8
    else if (distanceKm <= 1) score += hours <= 24 ? 12 : 6
    else if (distanceKm <= 3) score += hours <= 24 ? 8 : 3
    else if (distanceKm <= 10) score += hours <= 24 ? 4 : 1
    else score -= 20
  } else if (detection.camera?.zone && candidate.camera?.zone && detection.camera.zone === candidate.camera.zone) {
    score += hours <= 24 ? 6 : 2
    basis.push('misma zona')
  }

  if (hours <= 0.5) {
    score += 14
    basis.push('menos de 30 min')
  } else if (hours <= 6) {
    score += 10
    basis.push('menos de 6 h')
  } else if (hours <= 24) {
    score += 7
    basis.push('menos de 24 h')
  } else if (hours <= 24 * 7) {
    score += 4
    basis.push('menos de 7 dias')
  } else if (hours <= 24 * 14) {
    score += 2
    basis.push('menos de 14 dias')
  }

  if (Number.isFinite(candidate.visualSimilarity)) {
    if (candidate.visualSimilarity >= 82) {
      score += 34
      basis.push(`rasgos visuales y patron corporal similares ${Math.round(candidate.visualSimilarity)}%`)
    } else if (candidate.visualSimilarity >= 68) {
      score += 16
      basis.push(`rasgos visuales compatibles ${Math.round(candidate.visualSimilarity)}%`)
    } else if (candidate.visualSimilarity <= 42) {
      score -= 28
      basis.push(`rasgos visuales distintos ${Math.round(candidate.visualSimilarity)}%`)
    }
  }

  score += Math.min(10, Math.max(0, candidate.confidence / 10))

  return {
    basis,
    candidate,
    score: Math.round(Math.min(100, Math.max(0, score)))
  }
}

function hasStrongVisualEvidence(candidate, visualThreshold) {
  return Number.isFinite(candidate.visualSimilarity) && Number(candidate.visualSimilarity) >= visualThreshold
}

async function createIndividual(prisma, species) {
  const individual = await prisma.individual.create({ data: { species }, select: { id: true } })
  const label = `${species} #${individual.id}`

  return prisma.individual.update({
    where: { id: individual.id },
    data: { label },
    select: { id: true, label: true, species: true }
  })
}

async function assignIndividualMatchForPrisma(prisma, detectionId, env = process.env) {
  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    select: {
      cameraId: true,
      cameraTrapCode: true,
      confidence: true,
      createdAt: true,
      capturedAt: true,
      id: true,
      imagePath: true,
      individualId: true,
      species: true,
      userId: true,
      x1: true,
      x2: true,
      y1: true,
      y2: true,
      camera: { select: { id: true, latitude: true, longitude: true, zone: true } }
    }
  })

  if (!detection || !isEligibleForIndividualMatching(detection.species, detection.confidence)) {
    return null
  }

  const captureDate = getCaptureDate(detection)
  const lookbackDays = Math.max(1, Number(env.INDIVIDUAL_MATCH_LOOKBACK_DAYS || 14))
  const threshold = Math.max(1, Number(env.INDIVIDUAL_MATCH_THRESHOLD || 82))
  const visualThreshold = Math.max(1, Number(env.INDIVIDUAL_MATCH_VISUAL_THRESHOLD || 80))
  const maxCandidates = Math.max(1, Number(env.INDIVIDUAL_MATCH_MAX_CANDIDATES || 12))
  const since = new Date(captureDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
  const where = {
    id: { not: detection.id },
    species: detection.species,
    confidence: { gt: 0 },
    OR: [
      { capturedAt: { gte: since, lte: captureDate } },
      { capturedAt: null, createdAt: { gte: since, lte: detection.createdAt } }
    ]
  }

  if (detection.userId) where.userId = detection.userId

  const candidates = await prisma.detection.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: maxCandidates,
    select: {
      cameraId: true,
      cameraTrapCode: true,
      confidence: true,
      createdAt: true,
      capturedAt: true,
      id: true,
      imagePath: true,
      individualId: true,
      x1: true,
      x2: true,
      y1: true,
      y2: true,
      camera: { select: { id: true, latitude: true, longitude: true, zone: true } }
    }
  })
  const resolveImagePath = typeof env.resolveImagePath === 'function' ? env.resolveImagePath : resolveStoredDetectionPath
  const detectionPath = resolveImagePath?.(detection.imagePath)
  const candidatesWithVisualSimilarity = await Promise.all(candidates.map(async (candidate) => {
    const candidatePath = resolveImagePath?.(candidate.imagePath)
    const visualSimilarity = detectionPath && candidatePath
      ? await compareDetectionCrops(detectionPath, detection, candidatePath, candidate).catch(() => null)
      : null

    return { ...candidate, visualSimilarity }
  }))
  const best = candidatesWithVisualSimilarity
    .map((candidate) => scoreIndividualCandidate(detection, candidate))
    .sort((first, second) => second.score - first.score)[0]

  if (best && best.score >= threshold && hasStrongVisualEvidence(best.candidate, visualThreshold)) {
    let individualId = best.candidate.individualId

    if (!individualId) {
      const individual = await createIndividual(prisma, detection.species)
      individualId = individual.id
      await prisma.detection.update({
        where: { id: best.candidate.id },
        data: {
          individualId,
          individualMatchBasis: 'asignado como referencia inicial',
          individualMatchStatus: 'Individuo base'
        }
      })
    }

    return prisma.detection.update({
      where: { id: detection.id },
      data: {
        individualId,
        individualMatchBasis: best.basis.join('; '),
        individualMatchConfidence: best.score,
        individualMatchStatus: 'Probable reencuentro'
      },
      select: { id: true, individualId: true, individualMatchConfidence: true, individualMatchStatus: true }
    })
  }

  const individual = await createIndividual(prisma, detection.species)

  return prisma.detection.update({
    where: { id: detection.id },
    data: {
      individualId: individual.id,
      individualMatchBasis: 'sin candidato cercano con puntaje suficiente',
      individualMatchConfidence: null,
      individualMatchStatus: 'Nuevo individuo'
    },
    select: { id: true, individualId: true, individualMatchConfidence: true, individualMatchStatus: true }
  })
}

module.exports = {
  assignIndividualMatchForPrisma,
  haversineKm,
  isEligibleForIndividualMatching,
  scoreIndividualCandidate
}
