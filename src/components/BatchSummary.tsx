'use client'

import { CheckCircle2, Images, PawPrint, SearchX, TriangleAlert } from 'lucide-react'
import type { BatchJob, Camera } from './dashboardTypes'

export type SpeciesDistributionItem = {
  species: string
  count: number
  percentage?: number
  classificationLevel?: 'species' | 'family' | 'genus' | 'general' | 'taxonomic_group' | 'unclassified'
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
  return new Date(value).toLocaleString('es-ES', { dateStyle: 'medium' })
}

const cards = [
  { key: 'processedImages', label: 'Imagenes procesadas', icon: Images },
  { key: 'animalDetections', label: 'Detecciones con fauna', icon: PawPrint },
  { key: 'withoutDetection', label: 'Imagenes sin deteccion', icon: SearchX },
  { key: 'distinctSpecies', label: 'Especies distintas', icon: CheckCircle2 },
  { key: 'failedImages', label: 'Imagenes fallidas', icon: TriangleAlert }
] as const

export default function BatchSummary({ job, summary }: { job: BatchJob | null; summary: BatchSummaryData | null }) {
  if (!job) {
    return (
      <section className="batchSummaryPanel" id="batch-summary">
        <div className="panelHeader">
          <h2>Resumen del lote</h2>
        </div>
        <div className="emptyState">Selecciona o procesa un lote para ver su resumen.</div>
      </section>
    )
  }

  if (!summary) {
    return (
      <section className="batchSummaryPanel" id="batch-summary" aria-label="Resumen del lote">
        <div className="panelHeader">
          <div>
            <h2>Resumen del lote</h2>
            <p>{job.zipName}</p>
          </div>
        </div>
        <div className="emptyState">Preparando resumen del lote...</div>
      </section>
    )
  }

  return (
    <section className="batchSummaryPanel batchSummaryCompact" id="batch-summary" aria-label="Resumen del lote">
      <div className="panelHeader batchSummaryCompactHeader">
        <div>
          <h2>Resumen del lote</h2>
          <p>{summary.zipName} {'\u00b7'} {formatDate(summary.createdAt)}</p>
        </div>
      </div>

      <div className="batchSummaryGrid">
        {cards.map((card) => {
          const Icon = card.icon
          const value = summary[card.key]

          return (
            <article className="batchSummaryCard" key={card.key}>
              <span className="metricIcon"><Icon size={21} /></span>
              <strong>{value.toLocaleString('es-ES')}</strong>
              <span>{card.label}</span>
            </article>
          )
        })}
      </div>
    </section>
  )
}

