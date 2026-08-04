'use client'

import { Eye, SlidersHorizontal, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { getSpeciesLabel } from '@/lib/i18n'
import { isPendingManualReview, normalizePriority, normalizeReviewStatus } from '@/lib/manualReviewPolicy'
import type { Language, RecentDetection } from './dashboardTypes'

export type BatchDetectionFilters = {
  species: string
  minConfidence: string
  priority: string
  review: string
  detection: string
}

function getFilename(path: string) {
  return decodeURIComponent(path.split('/').pop() ?? path)
}

function ReviewPriorityBadge({ detection }: { detection: RecentDetection }) {
  const reviewStatus = normalizeReviewStatus(detection.manualReviewStatus)
  const isPending = isPendingManualReview(detection)
  const label = reviewStatus && !isPending ? reviewStatus : isPending ? 'Revision manual' : normalizePriority(detection.priority)
  const className =
    isPending
      ? 'priorityPill priorityReview'
      : label === 'Alta prioridad'
        ? 'priorityPill priorityHigh'
        : 'priorityPill priorityNormal'

  return <span className={className}>{label}</span>
}

function getIndividualLabel(detection: RecentDetection) {
  return detection.individual?.label ?? (detection.individualId ? `Individuo #${detection.individualId}` : 'Sin asignar')
}

function getMatchDetail(detection: RecentDetection) {
  if (!detection.individualMatchStatus) {
    return null
  }

  if (typeof detection.individualMatchConfidence === 'number') {
    return `${detection.individualMatchStatus} · ${Math.round(detection.individualMatchConfidence)}%`
  }

  return detection.individualMatchStatus
}

export default function BatchDetectionsTable({
  detections,
  filters,
  language = 'es',
  onFiltersChange,
  onOpenDetection,
  onPageChange,
  page,
  totalPages
}: {
  detections: RecentDetection[]
  filters: BatchDetectionFilters
  language?: Language
  onFiltersChange: (filters: BatchDetectionFilters) => void
  onOpenDetection: (detection: RecentDetection) => void
  onPageChange: (page: number) => void
  page: number
  totalPages: number
}) {
  const [quickSearch, setQuickSearch] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const speciesOptions = Array.from(new Set(detections.map((detection) => detection.species).filter(Boolean))).sort()
  const visibleDetections = useMemo(() => {
    const query = quickSearch.trim().toLowerCase()

    if (!query) {
      return detections
    }

    return detections.filter((detection) => getSpeciesLabel(detection.species, language).toLowerCase().includes(query))
  }, [detections, language, quickSearch])

  return (
    <section className="batchDetectionsPanel" aria-label="Resultados del lote">
      <div className="panelHeader compactPanelHeader">
        <div>
          <h2>Resultados del lote</h2>
          <p>Detecciones filtradas y paginadas del lote seleccionado.</p>
        </div>
      </div>

      <div className="batchFiltersMinimal">
        <label className="quickSearchBox">
          <Search size={17} />
          <input aria-label="Buscar especie" onChange={(event) => setQuickSearch(event.target.value)} placeholder="Buscar especie" value={quickSearch} />
        </label>

        <div className="detectionSegment" aria-label="Mostrar resultados">
          <button className={filters.detection === '' ? 'active' : ''} onClick={() => onFiltersChange({ ...filters, detection: '' })} type="button">Todas</button>
          <button className={filters.detection === 'with' ? 'active' : ''} onClick={() => onFiltersChange({ ...filters, detection: 'with' })} type="button">Con fauna</button>
          <button className={filters.detection === 'without' ? 'active' : ''} onClick={() => onFiltersChange({ ...filters, detection: 'without' })} type="button">Sin fauna</button>
        </div>

        <button className="secondaryButton advancedFiltersButton" onClick={() => setShowAdvancedFilters((current) => !current)} type="button">
          <SlidersHorizontal size={16} />
          Filtros avanzados
        </button>
      </div>

      {showAdvancedFilters ? (
        <div className="advancedFiltersPanel">
          <label>
            <span>Especie exacta</span>
            <select value={filters.species} onChange={(event) => onFiltersChange({ ...filters, species: event.target.value })}>
              <option value="">Todas</option>
              {speciesOptions.map((species) => (
                <option key={species} value={species}>{getSpeciesLabel(species, language)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Confianza minima</span>
            <input min="0" max="100" onChange={(event) => onFiltersChange({ ...filters, minConfidence: event.target.value })} type="number" value={filters.minConfidence} />
          </label>
          <label>
            <span>Prioridad</span>
            <select value={filters.priority} onChange={(event) => onFiltersChange({ ...filters, priority: event.target.value })}>
              <option value="">Todas</option>
              <option value="Normal">Normal</option>
              <option value="Alta prioridad">Alta prioridad</option>
              <option value="Revision manual">Revision manual</option>
            </select>
          </label>
          <label>
            <span>Revision</span>
            <select value={filters.review} onChange={(event) => onFiltersChange({ ...filters, review: event.target.value })}>
              <option value="">Todas</option>
              <option value="pending">Pendiente</option>
              <option value="reviewed">Revisada</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="tableWrap compactTableWrap">
        <table>
          <thead>
            <tr>
              <th>Miniatura</th>
              <th>Especie</th>
              <th>Individuo</th>
              <th>Confianza</th>
              <th>Prioridad</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibleDetections.length > 0 ? (
              visibleDetections.map((detection) => (
                <tr className="compactDetectionRow" key={detection.id} onDoubleClick={() => onOpenDetection(detection)}>
                  <td>
                    {detection.imagePath ? <img alt={getFilename(detection.imagePath)} className="wildlifeImage compactThumb" src={detection.imagePath} /> : <span className="wildlifeThumb compactThumb" />}
                  </td>
                  <td className="speciesCell">{getSpeciesLabel(detection.species, language)}</td>
                  <td>
                    {detection.individualId ? (
                      <Link className="tableInlineLink" href={`/individuals/${detection.individualId}`}>
                        {getIndividualLabel(detection)}
                      </Link>
                    ) : (
                      <strong>{getIndividualLabel(detection)}</strong>
                    )}
                    {getMatchDetail(detection) ? <span className="tableSubtext">{getMatchDetail(detection)}</span> : null}
                  </td>
                  <td className="confidenceCell"><span>{Math.round(detection.confidence)}%</span></td>
                  <td><ReviewPriorityBadge detection={detection} /></td>
                  <td>{new Date(detection.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    <button className="ghostTableAction" onClick={() => onOpenDetection(detection)} type="button">
                      <Eye size={15} />
                      Detalle
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="emptyState" colSpan={7}>No hay resultados para los filtros seleccionados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="paginationBar">
        <button className="secondaryButton" disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">Anterior</button>
        <span>Pagina {page} de {totalPages}</span>
        <button className="secondaryButton" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} type="button">Siguiente</button>
      </div>
    </section>
  )
}
