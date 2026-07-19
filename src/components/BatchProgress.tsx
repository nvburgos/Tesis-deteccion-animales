'use client'

import { useEffect, useMemo, useState } from 'react'
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
    pendingImages: number
    percentage: number | null
    detectionsFound: number
    createdAt: string
    completedAt: string | null
  }
}

function formatElapsed(createdAt?: string | null, completedAt?: string | null) {
  if (!createdAt) {
    return '-'
  }

  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.floor((end - new Date(createdAt).getTime()) / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return minutes > 0 ? `${minutes} min ${remainingSeconds} s` : `${remainingSeconds} s`
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
  const [now, setNow] = useState(() => Date.now())
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
        console.error('[batch-debug] polling error:', pollError)
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
  const completed = processed + failed
  const pending = job?.pendingImages ?? Math.max(0, total - completed)
  const percent = job?.percentage ?? (total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : null)
  const status = getStatusLabel(job?.status ?? (isProcessing ? 'Procesando' : 'Pendiente'), total)
  const elapsedSeconds = getElapsedSeconds(job?.createdAt, job?.completedAt)
  const elapsed = useMemo(() => formatElapsed(job?.createdAt, job?.completedAt), [job?.createdAt, job?.completedAt, now])
  const speed = elapsedSeconds > 0 && completed > 0 ? Math.round((completed / elapsedSeconds) * 60) : 0
  const remainingSeconds = speed > 0 && pending > 0 ? Math.ceil((pending / speed) * 60) : null
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
          <h2>{isTerminalStatus(job?.status) ? 'Procesamiento finalizado' : status}</h2>
          <p>{job?.zipName ?? zipName ?? 'Lote seleccionado'}</p>
        </div>
      </div>

      {pollingError ? <div className="statusBanner">{pollingError}</div> : null}

      <div className="batchProgressHero">
        <strong>
          {total > 0
            ? `${processed.toLocaleString('es-ES')} de ${total.toLocaleString('es-ES')} imagenes`
            : 'Preparando archivos'}
        </strong>
        {percent === null ? <span className="preparingLabel">Sin porcentaje</span> : <span className="progressPercentBadge">{percent}%</span>}
      </div>
      {percent !== null ? (
        <div className="batchProgressTrack" aria-label={`Avance ${percent}%`}>
          <span style={{ width: `${percent}%` }} />
          <strong>{percent}%</strong>
        </div>
      ) : null}

      <div className="batchProgressGrid">
        <div><span>Total</span><strong>{total > 0 ? total.toLocaleString('es-ES') : 'Calculando'}</strong></div>
        <div><span>Procesadas</span><strong>{processed.toLocaleString('es-ES')}</strong></div>
        <div><span>Pendientes</span><strong>{total > 0 ? pending.toLocaleString('es-ES') : '-'}</strong></div>
        <div><span>Fallidas</span><strong>{failed.toLocaleString('es-ES')}</strong></div>
        <div><span>Detecciones</span><strong>{detectionsFound.toLocaleString('es-ES')}</strong></div>
        <div><span>Tiempo transcurrido</span><strong>{elapsed}</strong></div>
        <div><span><Gauge size={14} /> Velocidad</span><strong>{speed > 0 ? `${speed.toLocaleString('es-ES')} imagenes/min` : '-'}</strong></div>
        <div><span><TimerReset size={14} /> Tiempo restante</span><strong>{formatRemaining(remainingSeconds)}</strong></div>
        <div><span>Estado</span><strong>{status}</strong></div>
      </div>
    </section>
  )
}

