'use client'

import { AlertTriangle, CheckCircle2, SearchX } from 'lucide-react'
import DetectionImage from './DetectionImage'
import type { DetectionResultData } from './dashboardTypes'

function formatConfidence(confidence: number) {
  const percent = confidence <= 1 ? confidence * 100 : confidence
  return `${Math.round(percent)}%`
}

export default function DetectionResult({ result }: { result: DetectionResultData | null }) {
  const hasSpecies = Boolean(result?.species && result.species !== 'Sin deteccion')

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
          <DetectionImage
            confidence={result.confidence}
            coordinates={result.coordinates}
            imagePath={result.imagePath}
            species={result.species}
          />

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
