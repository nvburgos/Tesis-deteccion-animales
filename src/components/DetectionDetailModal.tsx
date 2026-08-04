'use client'

import Link from 'next/link'
import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Maximize2, Minus, Move, Plus, ScanLine, X } from 'lucide-react'
import { getSpeciesLabel } from '@/lib/i18n'
import type { BatchJob, CameraSummary, Language, RecentDetection } from './dashboardTypes'

function getFilename(path: string) {
  return decodeURIComponent(path.split('/').pop() ?? path)
}

function formatConfidence(confidence = 0) {
  const percent = confidence <= 1 ? confidence * 100 : confidence
  return `${Math.round(percent)}%`
}

function clampZoom(value: number) {
  return Math.min(5, Math.max(0.5, value))
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Fecha de captura no disponible'
  return new Date(value).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'medium' })
}

function formatCaptureSource(value?: string | null) {
  if (value === 'EXIF_DATE_TIME_ORIGINAL') return 'EXIF DateTimeOriginal'
  if (value === 'EXIF_CREATE_DATE') return 'EXIF CreateDate'
  if (value === 'EXIF_DATE_TIME') return 'EXIF DateTime'
  if (value === 'FILENAME') return 'Nombre del archivo'
  if (value === 'OCR') return 'OCR'
  return 'UNKNOWN'
}

function formatTemperature(celsius?: number | null, fahrenheit?: number | null) {
  if (typeof celsius === 'number' && typeof fahrenheit === 'number') {
    return `${Math.round(celsius)} °C / ${Math.round(fahrenheit)} °F`
  }

  if (typeof celsius === 'number') {
    return `${Math.round(celsius)} °C`
  }

  if (typeof fahrenheit === 'number') {
    return `${Math.round(fahrenheit)} °F`
  }

  return 'No disponible'
}

function getIndividualLabel(detection: RecentDetection) {
  return detection.individual?.label ?? (detection.individualId ? `Individuo #${detection.individualId}` : 'Sin asignar')
}

function formatMatchConfidence(value?: number | null) {
  if (typeof value !== 'number') {
    return null
  }

  return `${Math.round(value)}%`
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
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const speciesLabel = detection ? getSpeciesLabel(detection.species, language) : ''
  const rawSpecies = detection?.species || 'No disponible'
  const showRawSpecies = Boolean(detection) && rawSpecies !== speciesLabel
  const confidenceLabel = formatConfidence(detection?.confidence ?? 0)
  const coordinates = useMemo(() => {
    if (!detection) {
      return null
    }

    return detection.x1 !== null && detection.x1 !== undefined &&
      detection.y1 !== null && detection.y1 !== undefined &&
      detection.x2 !== null && detection.x2 !== undefined &&
      detection.y2 !== null && detection.y2 !== undefined
        ? ([detection.x1, detection.y1, detection.x2, detection.y2] as [number, number, number, number])
        : null
  }, [detection])

  const box = useMemo(() => {
    if (!coordinates || !imageSize.width || !imageSize.height || speciesLabel === 'Sin deteccion') {
      return null
    }

    return {
      left: `${(coordinates[0] / imageSize.width) * 100}%`,
      top: `${(coordinates[1] / imageSize.height) * 100}%`,
      width: `${((coordinates[2] - coordinates[0]) / imageSize.width) * 100}%`,
      height: `${((coordinates[3] - coordinates[1]) / imageSize.height) * 100}%`
    }
  }, [coordinates, imageSize.height, imageSize.width, speciesLabel])

  useEffect(() => {
    if (!detection?.id) {
      return
    }

    setImageSize({ width: 0, height: 0 })
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setIsDragging(false)
    dragStart.current = null
  }, [detection?.id])

  if (!detection) {
    return null
  }

  function resetView(nextZoom = 1) {
    setZoom(nextZoom)
    setPan({ x: 0, y: 0 })
  }

  function handlePointerDown(event: MouseEvent<HTMLDivElement>) {
    dragStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    setIsDragging(true)
  }

  function handlePointerMove(event: MouseEvent<HTMLDivElement>) {
    if (!dragStart.current) {
      return
    }

    setPan({
      x: dragStart.current.panX + event.clientX - dragStart.current.x,
      y: dragStart.current.panY + event.clientY - dragStart.current.y
    })
  }

  function stopDragging() {
    dragStart.current = null
    setIsDragging(false)
  }

  function handleImageClick() {
    setZoom((current) => clampZoom(current + 0.5))
  }

  function requestFullscreen() {
    viewerRef.current?.requestFullscreen?.()
  }

  return (
    <div className="modalBackdrop detectionModalBackdrop" role="presentation">
      <section aria-modal="true" className="detectionDetailModal enhancedDetectionModal" role="dialog">
        <div className="cameraModalHeader detectionModalHeader">
          <div>
            <span>Detalle de imagen</span>
            <h2>{speciesLabel}</h2>
            {showRawSpecies ? <p>Etiqueta original: {rawSpecies}</p> : null}
          </div>
          <button aria-label="Cerrar" className="iconButton" onClick={onClose} type="button">
            <X size={19} />
          </button>
        </div>

        <div className="detectionDetailBody enhancedDetectionBody">
          <div className="imageInspectorPanel">
            <div className="imageToolbar" aria-label="Herramientas de imagen">
              <button className="iconButton" onClick={() => setZoom((current) => clampZoom(current + 0.25))} title="Zoom +" type="button"><Plus size={18} /></button>
              <button className="iconButton" onClick={() => setZoom((current) => clampZoom(current - 0.25))} title="Zoom -" type="button"><Minus size={18} /></button>
              <button className="secondaryButton compactToolButton" onClick={() => resetView(1)} type="button">100%</button>
              <button className="secondaryButton compactToolButton" onClick={() => resetView(1)} type="button">Ajustar</button>
              <button className="iconButton" onClick={requestFullscreen} title="Pantalla completa" type="button"><Maximize2 size={18} /></button>
              <a className="iconButton" download={getFilename(detection.imagePath)} href={detection.imagePath} title="Descargar imagen"><Download size={18} /></a>
            </div>

            <div
              className={isDragging ? 'imageZoomViewport dragging' : 'imageZoomViewport'}
              onMouseDown={handlePointerDown}
              onMouseLeave={stopDragging}
              onMouseMove={handlePointerMove}
              onMouseUp={stopDragging}
              ref={viewerRef}
            >
              <div
                className="imageZoomStage"
                onClick={handleImageClick}
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              >
                <img
                  alt={`Imagen analizada: ${speciesLabel}`}
                  className="zoomDetectionImage"
                  onLoad={(event) => {
                    setImageSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight
                    })
                  }}
                  src={detection.imagePath}
                />
                {box ? (
                  <div className="enhancedDetectionBox" style={box}>
                    <div className="enhancedDetectionLabel">
                      <strong>{speciesLabel}</strong>
                      <span>{confidenceLabel}</span>
                    </div>
                  </div>
                ) : (
                  <div className="noDetectionOverlay compactNoDetection"><strong>Sin cuadro de deteccion disponible</strong></div>
                )}
              </div>
            </div>

            <div className="imageZoomFooter">
              <span><Move size={15} /> Arrastra para desplazar</span>
              <strong>{Math.round(zoom * 100)}%</strong>
            </div>
          </div>

          <aside className="detectionSidePanel">
            <div><span>Especie</span><strong>{speciesLabel}</strong>{showRawSpecies ? <small>{rawSpecies}</small> : null}</div>
            <div><span>Confianza</span><strong>{confidenceLabel}</strong></div>
            <div><span>Prioridad</span><strong>{detection.priority}</strong></div>
            <div><span>Camara</span><strong>{camera.code}</strong><small>{camera.name}</small></div>
            <div><span>Lote</span><strong>{batch?.zipName ?? 'Sin lote asociado'}</strong></div>
            <div><span>Fecha de captura</span><strong>{detection.capturedAt ? formatDateTime(detection.capturedAt) : 'Fecha de captura no disponible'}</strong></div>
            <div><span>Fuente</span><strong>{formatCaptureSource(detection.captureDateSource)}</strong></div>
            <div><span>Codigo visible camara</span><strong>{detection.cameraTrapCode ?? 'No disponible'}</strong></div>
            <div><span>Temperatura</span><strong>{formatTemperature(detection.temperatureCelsius, detection.temperatureFahrenheit)}</strong></div>
            <div><span>Fecha de procesamiento</span><strong>{formatDateTime(detection.createdAt)}</strong></div>
            <div>
              <span>Reencuentro</span>
              {detection.individualId ? (
                <Link className="individualInlineLink" href={`/individuals/${detection.individualId}`}>
                  {getIndividualLabel(detection)}
                </Link>
              ) : (
                <strong>{getIndividualLabel(detection)}</strong>
              )}
              <small>
                {detection.individualMatchStatus ?? 'Sin analisis'}
                {formatMatchConfidence(detection.individualMatchConfidence) ? ` · ${formatMatchConfidence(detection.individualMatchConfidence)}` : ''}
              </small>
              {detection.individualMatchBasis ? <small>{detection.individualMatchBasis}</small> : null}
            </div>
            <div><span>Archivo original</span><strong>{getFilename(detection.imagePath)}</strong></div>
            <div><span>Texto OCR</span><strong>{detection.visibleMetadataText ?? 'No disponible'}</strong></div>
            <div><span>Observaciones</span><strong>{detection.manualReviewNote ?? 'Sin observaciones'}</strong></div>
            <div><span>Revision manual</span><strong>{detection.manualReviewedAt ? 'Revisada' : 'Pendiente'}</strong></div>
            <div><span>Deteccion</span><strong><ScanLine size={16} /> {box ? 'Cuadro disponible' : 'Sin coordenadas'}</strong></div>
          </aside>
        </div>
      </section>
    </div>
  )
}
