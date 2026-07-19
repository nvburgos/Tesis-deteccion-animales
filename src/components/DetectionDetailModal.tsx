'use client'

import { X } from 'lucide-react'
import DetectionImage from './DetectionImage'
import { getSpeciesLabel } from '@/lib/i18n'
import type { BatchJob, CameraSummary, Language, RecentDetection } from './dashboardTypes'

function getFilename(path: string) {
  return decodeURIComponent(path.split('/').pop() ?? path)
}

export default function DetectionDetailModal({
  batch,
  camera,
  detection,
  language = 'es',
  onClose
}: {
  batch: BatchJob | null
  camera: CameraSummary
  detection: RecentDetection | null
  language?: Language
  onClose: () => void
}) {
  if (!detection) {
    return null
  }

  const coordinates =
    detection.x1 !== null && detection.x1 !== undefined &&
    detection.y1 !== null && detection.y1 !== undefined &&
    detection.x2 !== null && detection.x2 !== undefined &&
    detection.y2 !== null && detection.y2 !== undefined
      ? ([detection.x1, detection.y1, detection.x2, detection.y2] as [number, number, number, number])
      : null

  return (
    <div className="modalBackdrop" role="presentation">
      <section aria-modal="true" className="detectionDetailModal" role="dialog">
        <div className="cameraModalHeader">
          <div>
            <span>Detalle de imagen</span>
            <h2>{getFilename(detection.imagePath)}</h2>
          </div>
          <button aria-label="Cerrar" className="iconButton" onClick={onClose} type="button">
            <X size={19} />
          </button>
        </div>

        <div className="detectionDetailBody">
          <DetectionImage
            confidence={detection.confidence}
            coordinates={coordinates}
            imagePath={detection.imagePath}
            species={getSpeciesLabel(detection.species, language)}
          />

          <div className="detectionDetailGrid">
            <div><span>Archivo original</span><strong>{getFilename(detection.imagePath)}</strong></div>
            <div><span>Especie</span><strong>{getSpeciesLabel(detection.species, language)}</strong></div>
            <div><span>Confianza</span><strong>{Math.round(detection.confidence)}%</strong></div>
            <div><span>Prioridad</span><strong>{detection.priority}</strong></div>
            <div><span>Etiqueta bruta SpeciesNet</span><strong>No disponible en el esquema actual</strong></div>
            <div><span>Revision manual</span><strong>{detection.manualReviewedAt ? 'Revisada' : 'Pendiente'}</strong></div>
            <div><span>Observaciones</span><strong>{detection.manualReviewNote ?? 'Sin observaciones'}</strong></div>
            <div><span>Camara</span><strong>{camera.name} · {camera.code}</strong></div>
            <div><span>Lote</span><strong>{batch?.zipName ?? 'Sin lote asociado'}</strong></div>
          </div>
        </div>
      </section>
    </div>
  )
}
