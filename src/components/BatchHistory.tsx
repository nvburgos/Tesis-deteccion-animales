'use client'

import { FileArchive } from 'lucide-react'
import type { BatchJob } from './dashboardTypes'

type BatchHistoryProps = {
  jobs: BatchJob[]
  selectedBatchId: number | null
  onSelect: (job: BatchJob) => void
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function formatDuration(job: BatchJob) {
  if (!job.completedAt) {
    return '-'
  }

  const seconds = Math.max(0, Math.round((new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()) / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return minutes > 0 ? `${minutes} min ${remainingSeconds} s` : `${remainingSeconds} s`
}

export default function BatchHistory({ jobs, onSelect, selectedBatchId }: BatchHistoryProps) {
  return (
    <section className="batchHistoryPanel" aria-label="Historial de lotes">
      <div className="panelHeader compactPanelHeader">
        <h2>Historial de lotes</h2>
      </div>

      <div className="batchHistoryList batchHistoryCompactList">
        {jobs.length > 0 ? (
          jobs.map((job) => (
            <article className={job.id === selectedBatchId ? 'batchHistoryItem batchHistoryCompactRow active' : 'batchHistoryItem batchHistoryCompactRow'} key={job.id}>
              <div className="batchHistoryFile">
                <span className="batchHistoryIcon"><FileArchive size={17} /></span>
                <strong>{job.zipName}</strong>
              </div>
              <span className="batchStatus">{job.status}</span>
              <span>{job.processedImages.toLocaleString('es-ES')}/{job.totalImages.toLocaleString('es-ES')} imagenes</span>
              <span>{(job.detectionsFound ?? 0).toLocaleString('es-ES')} detecciones</span>
              <span>{formatDuration(job)}</span>
              <span>{formatDate(job.createdAt)}</span>
              <button className="ghostTableAction" onClick={() => onSelect(job)} type="button">
                Ver resultados
              </button>
            </article>
          ))
        ) : (
          <div className="emptyState">Todavia no existen lotes procesados para esta camara.</div>
        )}
      </div>
    </section>
  )
}
