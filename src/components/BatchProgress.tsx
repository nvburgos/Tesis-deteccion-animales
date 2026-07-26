'use client'

import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Gauge, TimerReset } from 'lucide-react'
import type { BatchSummaryData } from './BatchSummary'
import type { BatchJob, RecentDetection } from './dashboardTypes'

type BatchDetailResponse = {
  error?: string
  job?: BatchJob
  summary?: BatchSummaryData
  detections?: RecentDetection[]
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  progress?: {
    id: number
    zipName: string
    status: string
    totalImages: number
    processedImages: number
    failedImages: number
    completedImages?: number
    pendingImages: number
    percentage: number | null
    detectionsFound: number
    withoutDetection?: number
    elapsedSeconds?: number | null
    queueSeconds?: number | null
    imagesPerMinute?: number | null
    averageSecondsPerImage?: number | null
    estimatedRemainingSeconds?: number | null
    stage?: string
    createdAt: string
    completedAt: string | null
    attempts?: number
    heartbeatAt?: string | null
    lastError?: string | null
    nextRetryAt?: string | null
    startedAt?: string | null
    workerId?: string | null
    stageUpdatedAt?: string | null
    pythonStage?: string | null
  }
}


function formatCompletedDuration(createdAt?: string | null, completedAt?: string | null) {
  if (!createdAt || !completedAt) {
    return '-'
  }

  const seconds = Math.max(0, Math.floor((new Date(completedAt).getTime() - new Date(createdAt).getTime()) / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return minutes > 0 ? `${minutes} min ${remainingSeconds} s` : `${remainingSeconds} s`
}

function getElapsedSeconds(createdAt?: string | null, completedAt?: string | null) {
  if (!createdAt) {
    return 0
  }

  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  return Math.max(0, Math.floor((end - new Date(createdAt).getTime()) / 1000))
}

function formatDecimal(value: number) {
  return value.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
}

function formatEta(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) {
    return 'Calculando...'
  }

  if (seconds < 60) {
    return 'Menos de 1 min'
  }

  return `Aprox. ${formatRemaining(seconds)}`
}
function formatRemaining(seconds: number | null) {
  if (seconds === null) {
    return '-'
  }

  if (seconds < 60) {
    return `${Math.max(1, seconds)} s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0 ? `${minutes} min ${remainingSeconds} s` : `${minutes} min`
}

function formatSince(value?: string | null) {
  if (!value) {
    return '-'
  }

  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) {
    return `hace ${seconds} s`
  }

  return `hace ${formatRemaining(seconds)}`
}

function getStatusLabel(status?: string, totalImages = 0) {
  if (!status) {
    return 'Pendiente'
  }

  if ((status === 'Pendiente' || status === 'Procesando') && totalImages === 0) {
    return 'Preparando archivos'
  }

  return status
}

function isTerminalStatus(status?: string) {
  return status === 'Completado' || status === 'Con errores' || status === 'Fallido' || status === 'Cancelado'
}

function getWorkerStartupWarning(job: BatchJob | null, elapsedSeconds: number) {
  if (!job || isTerminalStatus(job.status)) {
    return ''
  }

  if (job.lastError) {
    return `El procesamiento no pudo continuar: ${job.lastError}`
  }

  const hasWorkerActivity = Boolean(job.startedAt || job.heartbeatAt || job.workerId)
  if (job.status === 'Pendiente' && !hasWorkerActivity && elapsedSeconds >= 60) {
    return 'El lote fue creado, pero el worker de procesamiento no ha tomado la tarea. Inicia npm run worker:batches o revisa el health check del worker.'
  }

  return ''
}

async function loadBatchDetail(batchId: number) {
  const response = await fetch(`/api/batches/${batchId}`, { cache: 'no-store' })
  const data = (await response.json().catch(() => null)) as BatchDetailResponse | null

  if (!response.ok || !data) {
    throw new Error(data?.error ?? 'No se pudo consultar el progreso del lote')
  }

  return data
}

export default function BatchProgress({
  batchId,
  detectionsFound = 0,
  isProcessing,
  job,
  onBatchDetail,
  zipName
}: {
  batchId?: number | null
  detectionsFound?: number
  isProcessing: boolean
  job: BatchJob | null
  onBatchDetail?: (detail: BatchDetailResponse) => void
  zipName?: string
}) {
  const [, setNow] = useState(() => Date.now())
  const [pollingError, setPollingError] = useState('')
  const pollingBatchId = batchId ?? job?.id ?? null

  useEffect(() => {
    if (!pollingBatchId || isTerminalStatus(job?.status)) {
      return
    }

    let isCancelled = false

    const fetchProgress = async () => {
      try {
        const detail = await loadBatchDetail(pollingBatchId)

        if (!isCancelled) {
          setPollingError('')
          onBatchDetail?.(detail)
        }
      } catch (pollError) {
        console.error('Batch polling error:', pollError)
        if (!isCancelled) {
          setPollingError('No se pudo actualizar temporalmente el progreso.')
        }
      }
    }

    fetchProgress()
    const intervalId = window.setInterval(fetchProgress, 3000)

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
    }
  }, [pollingBatchId, job?.status, onBatchDetail])

  useEffect(() => {
    if (!job || isTerminalStatus(job.status)) {
      return
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [job])

  const total = job?.totalImages ?? 0
  const processed = job?.processedImages ?? 0
  const failed = job?.failedImages ?? 0
  const completed = job?.completedImages ?? processed + failed
  const pending = job?.pendingImages ?? Math.max(0, total - completed)
  const percent = job?.percentage ?? (total > 0 ? Math.min(100, (completed / total) * 100) : null)
  const visiblePercent = percent === null ? null : Math.round(percent)
  const status = getStatusLabel(job?.status ?? (isProcessing ? 'Procesando' : 'Pendiente'), total)
  const elapsedSeconds = job?.elapsedSeconds ?? getElapsedSeconds(job?.startedAt, job?.completedAt)
  const workerStartupWarning = getWorkerStartupWarning(job, getElapsedSeconds(job?.createdAt, job?.completedAt))
  const elapsed = elapsedSeconds > 0 ? formatRemaining(elapsedSeconds) : '-'
  const imagesPerMinute = job?.imagesPerMinute ?? null
  const remainingSeconds = job?.estimatedRemainingSeconds ?? null
  const stage = job?.stage ?? status
  const currentDetectionsFound = job?.detectionsFound ?? detectionsFound
  const withoutDetection = job?.withoutDetection ?? Math.max(0, processed - currentDetectionsFound)
  const workerActivity = formatSince(job?.heartbeatAt)
  const stageAge = formatSince(job?.stageUpdatedAt)
  const isTerminal = isTerminalStatus(job?.status)
  const isCompleted = job?.status === 'Completado'
  const completedDuration = formatCompletedDuration(job?.createdAt, job?.completedAt)

  if (isTerminal) {
    return (
      <section className="batchCompletionBanner" aria-label="Procesamiento completado">
        <div className="batchCompletionMain">
          <span className="resultIcon resultSuccess">
            <CheckCircle2 size={19} />
          </span>
          <div>
            <h2>{isCompleted ? 'Procesamiento completado' : 'Procesamiento finalizado'}</h2>
            <p>{job?.zipName ?? zipName ?? 'Lote seleccionado'}</p>
          </div>
        </div>
        <div className="batchCompletionMeta">
          {isCompleted ? <strong>100%</strong> : null}
          <span>{processed.toLocaleString('es-ES')} imagenes</span>
          <span>{completedDuration}</span>
          <span className="batchStatus">{job?.status ?? status}</span>
        </div>
      </section>
    )
  }

  return (
    <section className="batchProgressCard" aria-label="Progreso del procesamiento">
      <div className="batchProgressTitle">
        <span className="resultIcon resultSuccess">
          <Activity size={23} />
        </span>
        <div>
          <h2>{isTerminalStatus(job?.status) ? 'Procesamiento finalizado' : 'Procesando lote'}</h2>
          <p>{job?.zipName ?? zipName ?? 'Lote seleccionado'}</p>
        </div>
      </div>

      {pollingError ? <div className="statusBanner">{pollingError}</div> : null}
      {workerStartupWarning ? <div className="statusBanner statusBannerWarning">{workerStartupWarning}</div> : null}

      <div className="batchProgressHero">
        <strong>
          {total > 0
            ? `${processed.toLocaleString('es-ES')} de ${total.toLocaleString('es-ES')} imagenes`
            : 'Preparando archivos'}
        </strong>
        {visiblePercent === null ? <span className="preparingLabel">Sin porcentaje</span> : <span className="progressPercentBadge">{visiblePercent}%</span>}
      </div>
      {percent !== null ? (
        <div className="batchProgressTrack" aria-label={`Avance ${visiblePercent}%`}>
          <span style={{ width: `${Math.min(100, percent)}%` }} />
          <strong>{visiblePercent}%</strong>
        </div>
      ) : null}

      <div className="batchProgressGrid">
        <div><span>Total</span><strong>{total > 0 ? total.toLocaleString('es-ES') : 'Calculando'}</strong></div>
        <div><span>Procesadas</span><strong>{processed.toLocaleString('es-ES')}</strong></div>
        <div><span>Pendientes</span><strong>{total > 0 ? pending.toLocaleString('es-ES') : '-'}</strong></div>
        <div><span>Fallidas</span><strong>{failed.toLocaleString('es-ES')}</strong></div>
        <div><span>Detecciones con fauna</span><strong>{currentDetectionsFound.toLocaleString('es-ES')}</strong></div>
        <div><span>Sin deteccion</span><strong>{withoutDetection.toLocaleString('es-ES')}</strong></div>
        <div><span>Tiempo de procesamiento</span><strong>{elapsed}</strong></div>
        <div><span><Gauge size={14} /> Velocidad</span><strong>{imagesPerMinute ? `${formatDecimal(imagesPerMinute)} img/min` : 'Calculando...'}</strong></div>
        <div><span><TimerReset size={14} /> Tiempo restante estimado</span><strong>{formatEta(remainingSeconds)}</strong></div>
        <div><span>Etapa</span><strong>{stage}</strong></div>
        <div><span>Actividad worker</span><strong>{workerActivity}</strong></div>
        <div><span>Tiempo en etapa</span><strong>{stageAge}</strong></div>
      </div>
    </section>
  )
}
