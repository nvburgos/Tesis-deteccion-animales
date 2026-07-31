import { normalizeTaxonomyKey } from './speciesTaxonomy'

export type DetectionClassificationInput = {
  confidence?: number | null
  priority?: string | null
  species?: string | null
}

export const invalidSpeciesValues = [
  'Sin deteccion',
  'Sin detección',
  'No Detection',
  'No CV Result',
  'No Cv Result',
  'Unknown',
  'Desconocido',
  'Imagen no evaluable',
  '',
]

const broadSpeciesPatterns = [
  /\banimal\b/i,
  /\bmammal\b/i,
  /\bbird\b/i,
  /\brodent\b/i,
  /\breptile\b/i,
  /\bamphibian\b/i,
  /\bfish\b/i,
  /\binsect\b/i,
  /\bfamily\b/i,
  /\bspecies\b/i
]

const excludedPositiveSpecies = new Set([
  '',
  'sin deteccion',
  'sin detección',
  'no detection',
  'no cv result',
  'unknown',
  'desconocido',
  'imagen no evaluable'
])

const withoutDetectionSpecies = new Set([
  '',
  'sin deteccion',
  'sin detección',
  'no detection',
  'no cv result',
  'unknown',
  'desconocido',
  'imagen no evaluable'
])

export function normalizeSpeciesName(species: string | null | undefined) {
  return normalizeTaxonomyKey(species)
}

export function isValidSpecies(species: string | null | undefined) {
  const normalized = normalizeTaxonomyKey(species)
  return Boolean(normalized && !excludedPositiveSpecies.has(normalized))
}

export function isBroadSpeciesLabel(species: string | null | undefined) {
  const value = species?.trim()
  return Boolean(value && broadSpeciesPatterns.some((pattern) => pattern.test(value)))
}

export function isPositiveFaunaDetection(species: string | null | undefined, confidence = 0) {
  return isValidSpecies(species) && confidence > 0
}

export function isPositiveDetection(detection: DetectionClassificationInput) {
  return isPositiveFaunaDetection(detection.species, Number(detection.confidence ?? 0))
}

export function isWithoutDetectionResult(species: string | null | undefined, confidence = 0) {
  const normalized = normalizeTaxonomyKey(species)
  return !normalized || withoutDetectionSpecies.has(normalized) || confidence <= 0
}

export function isWithoutDetection(detection: DetectionClassificationInput) {
  return isWithoutDetectionResult(detection.species, Number(detection.confidence ?? 0))
}

export function isValidDistinctSpecies(species: string | null | undefined, confidence = 0) {
  return isPositiveFaunaDetection(species, confidence)
}

export function shouldRequireManualReview(detection: DetectionClassificationInput) {
  const priority = detection.priority ?? ''
  return priority === 'Revision manual' || !isPositiveDetection(detection) || isBroadSpeciesLabel(detection.species)
}

export function getConfidenceBucket(confidence: number) {
  if (confidence >= 90) return '90-100 %'
  if (confidence >= 80) return '80-89 %'
  if (confidence >= 70) return '70-79 %'
  if (confidence >= 50) return '50-69 %'
  return 'Menor de 50 %'
}

