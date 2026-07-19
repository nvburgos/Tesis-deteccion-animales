'use client'

import { CalendarClock, CheckCircle2, FileArchive, Images, PawPrint, SearchX, TriangleAlert } from 'lucide-react'
import type { BatchJob, Camera } from './dashboardTypes'

export type SpeciesDistributionItem = {
  species: string
  count: number
}

export type BatchSummaryData = {
  batchId: number
  zipName: string
  status: string
  totalImages: number
  processedImages: number
  failedImages: number
  pendingImages?: number
  percentage?: number | null
  detectionsFound?: number
  animalDetections: number
  withoutDetection: number
  distinctSpecies: number
  createdAt: string
  completedAt: string | null
  durationMs: number | null
  camera: Pick<Camera, 'id' | 'code' | 'name' | 'zone'> | null
  speciesDistribution: SpeciesDistributionItem[]
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return '-'
  }

  const seconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return minutes > 0 ? `${minutes} min ${remainingSeconds} s` : `${remainingSeconds} s`
}

const cards = [
  { key: 'processedImages', label: 'Imagenes procesadas', icon: Images },
  { key: 'animalDetections', label: 'Detecciones con animal', icon: PawPrint },
  { key: 'withoutDetection', label: 'Imagenes sin deteccion', icon: SearchX },
  { key: 'distinctSpecies', label: 'Especies distintas', icon: CheckCircle2 },
  { key: 'failedImages', label: 'Imagenes fallidas', icon: TriangleAlert }
] as const

export default function BatchSummary({ job, summary }: { job: BatchJob | null; summary: BatchSummaryData | null }) {
  if (!job) {
    return (
      <section className="batchSummaryPanel">
        <div className="panelHeader">
          <h2>Resumen del lote</h2>
        </div>
        <div className="emptyState">Selecciona o procesa un lote para ver su resumen.</div>
      </section>
    )
  }

  if (!summary) {
    return (
      <section className="batchSummaryPanel" aria-label="Resumen del lote">
        <div className="panelHeader">
          <div>
            <h2>Resumen del lote</h2>
            <p>{job.zipName}</p>
          </div>
          <span className="batchStatus">{job.status}</span>
        </div>
        <div className="emptyState">Preparando resumen del lote...</div>
      </section>
    )
  }

  return (
    <section className="batchSummaryPanel" aria-label="Resumen del lote">
      <div className="panelHeader">
        <div>
          <h2>Resumen del lote</h2>
          <p>{summary.zipName}</p>
        </div>
        <span className="batchStatus">{summary.status}</span>
      </div>

      <div className="batchIdentity">
        <div>
          <FileArchive size={18} />
          <span>{summary.zipName}</span>
        </div>
        <div>
          <PawPrint size={18} />
          <span>{summary.camera ? `${summary.camera.name} Â· ${summary.camera.code}` : 'Camara no asociada'}</span>
        </div>
        <div>
          <CalendarClock size={18} />
          <span>{formatDate(summary.createdAt)}</span>
        </div>
        <div>
          <span>Duracion</span>
          <strong>{formatDuration(summary.durationMs)}</strong>
        </div>
      </div>

      <div className="batchSummaryGrid">
        {cards.map((card) => {
          const Icon = card.icon
          const value = summary[card.key]

          return (
            <article className="batchSummaryCard" key={card.key}>
              <span className="metricIcon"><Icon size={21} /></span>
              <span>{card.label}</span>
              <strong>{value.toLocaleString('es-ES')}</strong>
            </article>
          )
        })}
      </div>
    </section>
  )
}


