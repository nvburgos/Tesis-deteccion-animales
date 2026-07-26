export type BatchProgressJob = {
  status: string
  totalImages: number
  processedImages: number
  failedImages: number
  createdAt: Date
  startedAt?: Date | null
  completedAt?: Date | null
  heartbeatAt?: Date | null
  workerId?: string | null
}

export type BatchProgressMetrics = {
  averageSecondsPerImage: number | null
  completedImages: number
  elapsedSeconds: number | null
  estimatedRemainingSeconds: number | null
  imagesPerMinute: number | null
  pendingImages: number
  percentage: number | null
  queueSeconds: number | null
  stage: string
}

function getSecondsBetween(start?: Date | null, end?: Date | null) {
  if (!start || !end) {
    return null
  }

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
}

export function getBatchStage(job: BatchProgressJob, completedImages: number) {
  if (job.status === 'Pendiente') {
    return 'En cola'
  }

  if (job.status === 'Completado') {
    return 'Completado'
  }

  if (job.status === 'Con errores' || job.status === 'Fallido' || job.status === 'Cancelado') {
    return job.status
  }

  if (!job.startedAt || !job.workerId) {
    return 'En cola'
  }

  if (job.status === 'Procesando' && completedImages === 0) {
    return 'Cargando modelo de inteligencia artificial'
  }

  if (job.status === 'Procesando') {
    return `Procesando imagen ${Math.min(completedImages + 1, job.totalImages)} de ${job.totalImages}`
  }

  return job.status
}

export function calculateBatchProgress(job: BatchProgressJob, now = new Date()): BatchProgressMetrics {
  const completedImages = Math.max(0, job.processedImages + job.failedImages)
  const pendingImages = Math.max(0, job.totalImages - completedImages)
  const percentage = job.totalImages > 0 ? Math.min(100, (completedImages / job.totalImages) * 100) : null
  const effectiveEnd = job.completedAt ?? now
  const elapsedSeconds = job.startedAt ? getSecondsBetween(job.startedAt, effectiveEnd) : null
  const queueSeconds = job.startedAt ? getSecondsBetween(job.createdAt, job.startedAt) : getSecondsBetween(job.createdAt, now)
  const canEstimateSpeed = Boolean(job.startedAt) && completedImages >= 2 && (elapsedSeconds ?? 0) >= 10
  const imagesPerSecond = canEstimateSpeed && elapsedSeconds && elapsedSeconds > 0 ? completedImages / elapsedSeconds : null
  const imagesPerMinute = imagesPerSecond ? imagesPerSecond * 60 : null
  const averageSecondsPerImage = imagesPerSecond ? 1 / imagesPerSecond : null
  const estimatedRemainingSeconds = imagesPerSecond && pendingImages > 0 ? Math.ceil(pendingImages / imagesPerSecond) : null

  return {
    averageSecondsPerImage,
    completedImages,
    elapsedSeconds,
    estimatedRemainingSeconds,
    imagesPerMinute,
    pendingImages,
    percentage,
    queueSeconds,
    stage: getBatchStage(job, completedImages)
  }
}