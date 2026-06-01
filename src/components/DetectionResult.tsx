'use client'

import { AlertTriangle, CheckCircle2, SearchX } from 'lucide-react'
import { useState } from 'react'
import type { DetectionResultData } from './dashboardTypes'

type ImageSize = {
  height: number
  width: number
}

function formatConfidence(confidence: number) {
  const percent = confidence <= 1 ? confidence * 100 : confidence
  return `${Math.round(percent)}%`
}

function getBoxStyle(coordinates: [number, number, number, number], imageSize: ImageSize) {
  const [x1, y1, x2, y2] = coordinates

  return {
    height: `${Math.max(((y2 - y1) / imageSize.height) * 100, 0)}%`,
    left: `${Math.max((x1 / imageSize.width) * 100, 0)}%`,
    top: `${Math.max((y1 / imageSize.height) * 100, 0)}%`,
    width: `${Math.max(((x2 - x1) / imageSize.width) * 100, 0)}%`
  }
}

export default function DetectionResult({ result }: { result: DetectionResultData | null }) {
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const hasSpecies = Boolean(result?.species && result.species !== 'Sin deteccion')
  const canShowBox = Boolean(result?.imagePath && result.coordinates && imageSize)

  return (
    <section className="resultCard" aria-label="Resultado de deteccion">
      <div className="resultHeading">
        <span className={hasSpecies ? 'resultIcon resultSuccess' : 'resultIcon'}>
          {hasSpecies ? <CheckCircle2 size={24} /> : <SearchX size={24} />}
        </span>
        <div>
          <h2>Resultado del analisis</h2>
          <p>{result ? 'Prediccion generada para la imagen cargada.' : 'Aun no hay una imagen analizada.'}</p>
        </div>
      </div>

      {result ? (
        <>
          {result.imagePath ? (
            <div className="detectionPreview">
              <img
                alt="Imagen analizada con recuadro de deteccion"
                className="detectionPreviewImage"
                onLoad={(event) => {
                  setImageSize({
                    height: event.currentTarget.naturalHeight,
                    width: event.currentTarget.naturalWidth
                  })
                }}
                src={result.imagePath}
              />
              {canShowBox && result.coordinates && imageSize ? (
                <span
                  aria-hidden="true"
                  className="detectionBox"
                  style={getBoxStyle(result.coordinates, imageSize)}
                />
              ) : null}
            </div>
          ) : null}

          <div className="resultGrid">
            <div>
              <span>Especie detectada</span>
              <strong>{result.species || 'Sin deteccion'}</strong>
            </div>
            <div>
              <span>Confianza</span>
              <strong>{formatConfidence(result.confidence)}</strong>
            </div>
            <div>
              <span>Prioridad</span>
              <strong>{result.priority}</strong>
            </div>
          </div>
        </>
      ) : (
        <div className="emptyResult">
          <AlertTriangle size={20} />
          <span>Selecciona una imagen y presiona Analizar imagen para ver la deteccion.</span>
        </div>
      )}

      {result?.message ? <p className="resultMessage">{result.message}</p> : null}
    </section>
  )
}
