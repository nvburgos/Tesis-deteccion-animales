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

export default function BatchHistory({ jobs, onSelect, selectedBatchId }: BatchHistoryProps) {
  return (
    <section className="batchHistoryPanel" aria-label="Historial de lotes">
      <div className="panelHeader">
        <h2>Historial de lotes</h2>
      </div>

      <div className="batchHistoryList">
        {jobs.length > 0 ? (
          jobs.map((job) => (
            <article className={job.id === selectedBatchId ? 'batchHistoryItem active' : 'batchHistoryItem'} key={job.id}>
              <span className="batchHistoryIcon"><FileArchive size={20} /></span>
              <div>
                <strong>{job.zipName}</strong>
                <span>{formatDate(job.createdAt)}</span>
              </div>
              <div className="batchHistoryStats">
                <span>{job.processedImages}/{job.totalImages} imagenes</span>
                <span>{job.failedImages} fallidas</span>
                <span>{job.status}</span>
              </div>
              <button className="secondaryButton" onClick={() => onSelect(job)} type="button">
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
