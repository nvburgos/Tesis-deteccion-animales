'use client'

import { Eye } from 'lucide-react'
import { getSpeciesLabel } from '@/lib/i18n'
import type { Language, Priority, RecentDetection } from './dashboardTypes'

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

function PriorityBadge({ priority }: { priority: Priority }) {
  const className =
    priority === 'Alta prioridad'
      ? 'priorityPill priorityHigh'
      : priority === 'Revision manual'
        ? 'priorityPill priorityReview'
        : 'priorityPill priorityNormal'

  return <span className={className}>{priority}</span>
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
  const speciesOptions = Array.from(new Set(detections.map((detection) => detection.species).filter(Boolean))).sort()

  return (
    <section className="batchDetectionsPanel" aria-label="Resultados del lote">
      <div className="panelHeader">
        <div>
          <h2>Resultados del lote</h2>
          <p>Detecciones filtradas y paginadas del lote seleccionado.</p>
        </div>
      </div>

      <div className="batchFilters">
        <label>
          <span>Especie</span>
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
        <label>
          <span>Deteccion</span>
          <select value={filters.detection} onChange={(event) => onFiltersChange({ ...filters, detection: event.target.value })}>
            <option value="">Todas</option>
            <option value="with">Con deteccion</option>
            <option value="without">Sin deteccion</option>
          </select>
        </label>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Miniatura</th>
              <th>Archivo</th>
              <th>Especie detectada</th>
              <th>Confianza</th>
              <th>Prioridad</th>
              <th>Fecha/hora</th>
              <th>Revision</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {detections.length > 0 ? (
              detections.map((detection) => (
                <tr key={detection.id} onDoubleClick={() => onOpenDetection(detection)}>
                  <td>
                    {detection.imagePath ? <img alt={getFilename(detection.imagePath)} className="wildlifeImage" src={detection.imagePath} /> : <span className="wildlifeThumb" />}
                  </td>
                  <td>
                    <strong>{getFilename(detection.imagePath)}</strong>
                    <span className="tableSubtext">ID {detection.id}</span>
                  </td>
                  <td className="speciesCell">{getSpeciesLabel(detection.species, language)}</td>
                  <td className="confidenceCell"><span>{Math.round(detection.confidence)}%</span></td>
                  <td><PriorityBadge priority={detection.priority} /></td>
                  <td>{new Date(detection.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{detection.manualReviewedAt ? 'Revisada' : 'Pendiente'}</td>
                  <td>
                    <button className="secondaryButton tableActionButton" onClick={() => onOpenDetection(detection)} type="button">
                      <Eye size={15} />
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="emptyState" colSpan={8}>No hay resultados para los filtros seleccionados.</td>
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
