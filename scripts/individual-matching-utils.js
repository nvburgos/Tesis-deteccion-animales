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

function scoreIndividualCandidate(detection, candidate) {
  const basis = ['misma especie']
  let score = 35

  if (detection.cameraId && candidate.cameraId && detection.cameraId === candidate.cameraId) {
    score += 30
    basis.push('misma camara')
  } else if (detection.cameraTrapCode && candidate.cameraTrapCode && detection.cameraTrapCode === candidate.cameraTrapCode) {
    score += 26
    basis.push(`mismo codigo visible de camara ${detection.cameraTrapCode}`)
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

    if (distanceKm <= 0.25) score += 30
    else if (distanceKm <= 1) score += 24
    else if (distanceKm <= 3) score += 16
    else if (distanceKm <= 10) score += 8
    else score -= 20
  } else if (detection.camera?.zone && candidate.camera?.zone && detection.camera.zone === candidate.camera.zone) {
    score += 8
    basis.push('misma zona')
  }

  const hours = Math.abs(getCaptureDate(detection).getTime() - getCaptureDate(candidate).getTime()) / 36e5

  if (hours <= 0.5) {
    score += 25
    basis.push('menos de 30 min')
  } else if (hours <= 6) {
    score += 20
    basis.push('menos de 6 h')
  } else if (hours <= 24) {
    score += 15
    basis.push('menos de 24 h')
  } else if (hours <= 24 * 7) {
    score += 8
    basis.push('menos de 7 dias')
  } else if (hours <= 24 * 14) {
    score += 4
    basis.push('menos de 14 dias')
  }

  score += Math.min(10, Math.max(0, candidate.confidence / 10))

  return {
    basis,
    candidate,
    score: Math.round(Math.min(100, Math.max(0, score)))
  }
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
      individualId: true,
      species: true,
      userId: true,
      camera: { select: { id: true, latitude: true, longitude: true, zone: true } }
    }
  })

  if (!detection || !isEligibleForIndividualMatching(detection.species, detection.confidence)) {
    return null
  }

  const captureDate = getCaptureDate(detection)
  const lookbackDays = Math.max(1, Number(env.INDIVIDUAL_MATCH_LOOKBACK_DAYS || 14))
  const threshold = Math.max(1, Number(env.INDIVIDUAL_MATCH_THRESHOLD || 65))
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
    take: 60,
    select: {
      cameraId: true,
      cameraTrapCode: true,
      confidence: true,
      createdAt: true,
      capturedAt: true,
      id: true,
      individualId: true,
      camera: { select: { id: true, latitude: true, longitude: true, zone: true } }
    }
  })
  const best = candidates
    .map((candidate) => scoreIndividualCandidate(detection, candidate))
    .sort((first, second) => second.score - first.score)[0]

  if (best && best.score >= threshold) {
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
