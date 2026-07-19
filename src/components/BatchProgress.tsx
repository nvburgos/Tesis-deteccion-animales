'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
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
  console.log('[batch-debug] polling status:', response.status)
  const data = (await response.json().catch(() => null)) as BatchDetailResponse | null
  console.log('[batch-debug] polling data:', data)

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

    console.log('[batch-debug] polling iniciado', { batchId: pollingBatchId })
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
  const pending = job?.pendingImages ?? Math.max(0, total - processed - failed)
  const percent = job?.percentage ?? (total > 0 ? Math.min(100, Math.round(((processed + failed) / total) * 100)) : null)
  const status = getStatusLabel(job?.status ?? (isProcessing ? 'Procesando' : 'Pendiente'), total)
  const elapsed = useMemo(() => formatElapsed(job?.createdAt, job?.completedAt), [job?.createdAt, job?.completedAt, now])

  return (
    <section className="batchProgressCard" aria-label="Progreso del procesamiento">
      <div className="batchProgressTitle">
        <span className="resultIcon resultSuccess">
          <Activity size={23} />
        </span>
        <div>
          <h2>{isTerminalStatus(job?.status) ? 'Lote finalizado' : status}</h2>
          <p>{job?.zipName ?? zipName ?? 'Lote seleccionado'}</p>
        </div>
      </div>

      {pollingError ? <div className="statusBanner">{pollingError}</div> : null}

      <div className="batchProgressHero">
        <strong>
          {total > 0
            ? `${processed.toLocaleString('es-ES')} de ${total.toLocaleString('es-ES')} imagenes`
            : 'Preparando lote'}
        </strong>
        {percent === null ? <span className="preparingLabel">Sin porcentaje</span> : <span>{percent}%</span>}
      </div>
      {percent !== null ? (
        <div className="analysisProgressTrack">
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}

      <div className="batchProgressGrid">
        <div><span>Total</span><strong>{total > 0 ? total.toLocaleString('es-ES') : 'Calculando'}</strong></div>
        <div><span>Procesadas</span><strong>{processed.toLocaleString('es-ES')}</strong></div>
        <div><span>Pendientes</span><strong>{total > 0 ? pending.toLocaleString('es-ES') : '-'}</strong></div>
        <div><span>Fallidas</span><strong>{failed.toLocaleString('es-ES')}</strong></div>
        <div><span>Detecciones</span><strong>{detectionsFound.toLocaleString('es-ES')}</strong></div>
        <div><span>Tiempo transcurrido</span><strong>{elapsed}</strong></div>
        <div><span>Estado</span><strong>{status}</strong></div>
      </div>
    </section>
  )
}


