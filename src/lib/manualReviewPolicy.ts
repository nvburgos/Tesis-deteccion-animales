import { isPositiveDetection, normalizeSpeciesName } from './detectionClassification'
import { normalizeTaxonomyKey } from './speciesTaxonomy'

export const manualReviewStatuses = ['Pendiente', 'Confirmada', 'Corregida', 'Sin fauna', 'No evaluable', 'Descartada'] as const

export type ManualReviewStatus = (typeof manualReviewStatuses)[number]

export const REVIEW_PRIORITY = 'Revision manual'
export const PENDING_REVIEW_STATUS = 'Pendiente'

const normalizedStatusMap = new Map<string, ManualReviewStatus>([
  ['pendiente', 'Pendiente'],
  ['confirmada', 'Confirmada'],
  ['corregida', 'Corregida'],
  ['sin fauna', 'Sin fauna'],
  ['no evaluable', 'No evaluable'],
  ['descartada', 'Descartada']
])

const normalizedPriorityMap = new Map<string, string>([
  ['revision manual', REVIEW_PRIORITY],
  ['manual review', REVIEW_PRIORITY],
  ['alta prioridad', 'Alta prioridad'],
  ['high priority', 'Alta prioridad'],
  ['normal', 'Normal']
])

type ReviewStatusInput = {
  originalSpecies?: string | null
  reviewedSpecies?: string | null
  explicitStatus?: string | null
}

export type PendingManualReviewInput = {
  confidence?: number | null
  manualReviewedAt?: unknown
  manualReviewStatus?: string | null
  priority?: string | null
  species?: string | null
}

export function normalizeReviewStatus(value?: string | null): ManualReviewStatus | null {
  return normalizedStatusMap.get(normalizeTaxonomyKey(value)) ?? null
}

export function normalizePriority(value?: string | null) {
  return normalizedPriorityMap.get(normalizeTaxonomyKey(value)) ?? (value?.trim() || '')
}

export function isManualReviewStatus(value?: string | null): value is ManualReviewStatus {
  return normalizeReviewStatus(value) !== null
}

export function getManualReviewStatus(input: ReviewStatusInput): ManualReviewStatus {
  const explicitStatus = normalizeReviewStatus(input.explicitStatus)
  if (explicitStatus) {
    return explicitStatus
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

  if (!isPositiveDetection({ species: reviewedSpecies, confidence: 1 })) {
    return 'Corregida'
  }

  const normalizedOriginal = normalizeSpeciesName(input.originalSpecies)
  return normalizedOriginal === normalizedReviewed ? 'Confirmada' : 'Corregida'
}

export function isTerminalManualReviewStatus(value?: string | null) {
  const status = normalizeReviewStatus(value)
  return Boolean(status && status !== 'Pendiente')
}

export function isPendingManualReview(detection: PendingManualReviewInput) {
  const status = normalizeReviewStatus(detection.manualReviewStatus)

  if (status) {
    return status === 'Pendiente'
  }

  if (detection.manualReviewedAt) {
    return false
  }

  return normalizePriority(detection.priority) === REVIEW_PRIORITY || !isPositiveDetection(detection)
}