import { isValidSpecies, normalizeSpeciesName } from './detectionClassification'

export const manualReviewStatuses = ['Pendiente', 'Confirmada', 'Corregida', 'Sin fauna', 'No evaluable', 'Descartada'] as const

export type ManualReviewStatus = (typeof manualReviewStatuses)[number]

type ReviewStatusInput = {
  originalSpecies?: string | null
  reviewedSpecies?: string | null
  explicitStatus?: string | null
}

export function isManualReviewStatus(value?: string | null): value is ManualReviewStatus {
  return manualReviewStatuses.includes(value as ManualReviewStatus)
}

export function getManualReviewStatus(input: ReviewStatusInput): ManualReviewStatus {
  if (isManualReviewStatus(input.explicitStatus)) {
    return input.explicitStatus
  }

  const reviewedSpecies = input.reviewedSpecies?.trim()

  if (!reviewedSpecies) {
    return 'Pendiente'
  }

  const normalizedReviewed = normalizeSpeciesName(reviewedSpecies)

  if (normalizedReviewed === 'sin deteccion') {
    return 'Sin fauna'
  }

  if (normalizedReviewed === 'imagen no evaluable') {
    return 'No evaluable'
  }

  if (!isValidSpecies(reviewedSpecies)) {
    return 'Corregida'
  }

  const normalizedOriginal = normalizeSpeciesName(input.originalSpecies)
  return normalizedOriginal === normalizedReviewed ? 'Confirmada' : 'Corregida'
}

export function isPendingManualReview(detection: { manualReviewStatus?: string | null; manualReviewedAt?: unknown; priority?: string | null }) {
  if (detection.manualReviewStatus) {
    return detection.manualReviewStatus === 'Pendiente'
  }

  return detection.priority === 'Revision manual' && !detection.manualReviewedAt
}