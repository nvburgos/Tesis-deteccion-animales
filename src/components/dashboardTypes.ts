import type { Language } from '@/lib/i18n'

export type Priority = 'Normal' | 'Alta prioridad' | 'Revision manual'

export type Camera = {
  id: number
  code: string
  name: string
  zone: string
  description: string | null
  latitude?: number | null
  longitude?: number | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export type CameraSummary = Camera & {
  lastUploadAt: string | null
  totalImagesProcessed: number
  totalSpeciesDetected: number
}

export type DetectionResultData = {
  species: string | null
  confidence: number
  priority: Priority
  coordinates?: [number, number, number, number] | null
  message?: string
  imagePath?: string
  location?: string
  createdAt?: string
  capturedAt?: string | null
  captureDateSource?: string | null
  cameraTrapCode?: string | null
  temperatureCelsius?: number | null
  temperatureFahrenheit?: number | null
  visibleMetadataText?: string | null
  cameraId?: number | null
  batchJobId?: number | null
  camera?: Pick<Camera, 'id' | 'code' | 'name' | 'zone'> | null
  individualId?: number | null
  individualMatchStatus?: string | null
  individualMatchConfidence?: number | null
  individualMatchBasis?: string | null
  individual?: {
    id: number
    species: string
    label: string | null
  } | null
  previousSameSpeciesCount?: number
  sameSpeciesLastDetectedAt?: string | null
  sameSpeciesLastLocation?: string | null
  sameSpeciesStatus?: string
}

export type RecentDetection = {
  id: number
  imagePath: string
  species: string
  confidence: number
  location: string
  priority: Priority
  createdAt: string
  capturedAt?: string | null
  captureDateSource?: string | null
  cameraTrapCode?: string | null
  temperatureCelsius?: number | null
  temperatureFahrenheit?: number | null
  visibleMetadataText?: string | null
  time?: string
  cameraId?: number | null
  batchJobId?: number | null
  camera?: Pick<Camera, 'id' | 'code' | 'name' | 'zone'> | null
  individualId?: number | null
  individualMatchStatus?: string | null
  individualMatchConfidence?: number | null
  individualMatchBasis?: string | null
  individual?: {
    id: number
    species: string
    label: string | null
  } | null
  userId?: number | null
  researcher?: string
  researcherEmail?: string | null
  manualReviewedAt?: string | null
  manualReviewNote?: string | null
  manualReviewStatus?: string | null
  reviewedById?: number | null
  reviewedBy?: { id: number; name: string; email: string } | null
  manualOriginalSpecies?: string | null
  manualCorrectedSpecies?: string | null
  reviewVersion?: number
  x1?: number | null
  y1?: number | null
  x2?: number | null
  y2?: number | null
}

export type DashboardMetric = {
  label: string
  value: string
  detail: string
}

export type BatchJob = {
  id: number
  completedAt: string | null
  createdAt: string
  error?: string | null
  attempts?: number
  averageSecondsPerImage?: number | null
  completedImages?: number
  elapsedSeconds?: number | null
  estimatedRemainingSeconds?: number | null
  heartbeatAt?: string | null
  imagesPerMinute?: number | null
  lastError?: string | null
  nextRetryAt?: string | null
  queueSeconds?: number | null
  stage?: string
  stageUpdatedAt?: string | null
  pythonStage?: string | null
  startedAt?: string | null
  withoutDetection?: number
  workerId?: string | null
  detectionsFound?: number
  failedImages: number
  pendingImages?: number
  percentage?: number | null
  processedImages: number
  researcher?: string | null
  researcherEmail?: string | null
  status: string
  totalImages: number
  zipName: string
  cameraId?: number | null
  camera?: Pick<Camera, 'id' | 'code' | 'name' | 'zone'> | null
}

export type DashboardView = 'dashboard' | 'species' | 'reviews'

export type { Language }
