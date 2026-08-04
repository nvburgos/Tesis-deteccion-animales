import { prisma } from '@/lib/prisma'
import { isBroadSpeciesLabel, isValidSpecies } from '@/lib/detectionClassification'
import { normalizeTaxonomyKey } from '@/lib/speciesTaxonomy'

const trainableReviewStatuses = new Set(['Confirmada', 'Corregida'])
const defaultGroup = 'Por revisar'

type ReviewedDetection = {
  id: number
  imagePath: string
  manualReviewStatus: string | null
  reviewedById: number | null
  species: string
}

function isTrainableReviewedDetection(detection: ReviewedDetection) {
  return (
    trainableReviewStatuses.has(detection.manualReviewStatus ?? '') &&
    isValidSpecies(detection.species) &&
    !isBroadSpeciesLabel(detection.species)
  )
}

function titleCaseFallback(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

async function findSpeciesByReviewedName(reviewedSpecies: string) {
  const normalizedReviewed = normalizeTaxonomyKey(reviewedSpecies)
  const exact = await prisma.species.findFirst({
    where: { scientificName: { equals: reviewedSpecies, mode: 'insensitive' } }
  })

  if (exact) return exact

  const candidates = await prisma.species.findMany({
    where: {
      OR: [
        { scientificName: { contains: reviewedSpecies.split(/\s+/)[0] ?? reviewedSpecies, mode: 'insensitive' } },
        { commonName: { contains: reviewedSpecies, mode: 'insensitive' } }
      ]
    },
    take: 30
  })

  return candidates.find((candidate) => normalizeTaxonomyKey(candidate.scientificName) === normalizedReviewed) ?? null
}

async function ensureSpeciesForReview(reviewedSpecies: string) {
  const knownSpecies = await findSpeciesByReviewedName(reviewedSpecies)
  if (knownSpecies) return knownSpecies

  return prisma.species.create({
    data: {
      scientificName: titleCaseFallback(reviewedSpecies),
      source: 'Revision manual',
      taxonomicGroup: defaultGroup
    }
  })
}

export async function syncTrainingSampleForDetection(detectionId: number, reviewedById?: number | null) {
  const detection = await prisma.detection.findUnique({
    where: { id: detectionId },
    select: {
      id: true,
      imagePath: true,
      manualReviewStatus: true,
      reviewedById: true,
      species: true
    }
  })

  if (!detection || !isTrainableReviewedDetection(detection)) {
    await prisma.trainingSample.deleteMany({ where: { detectionId } })
    if (detection) {
      await prisma.detection.update({
        where: { id: detection.id },
        data: { validatedSpeciesId: null }
      })
    }
    return null
  }

  const species = await ensureSpeciesForReview(detection.species)
  const reviewerId = reviewedById ?? detection.reviewedById ?? null

  const trainingSample = await prisma.trainingSample.upsert({
    where: { detectionId: detection.id },
    create: {
      detectionId: detection.id,
      imagePath: detection.imagePath,
      label: species.scientificName,
      reviewedById: reviewerId,
      speciesId: species.id,
      status: 'trainable'
    },
    update: {
      imagePath: detection.imagePath,
      label: species.scientificName,
      reviewedById: reviewerId,
      speciesId: species.id,
      status: 'trainable'
    }
  })

  await prisma.detection.update({
    where: { id: detection.id },
    data: { validatedSpeciesId: species.id }
  })

  return trainingSample
}
