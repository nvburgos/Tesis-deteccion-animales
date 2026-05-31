'use client'

import { AlertTriangle, CheckCircle2, SearchX } from 'lucide-react'
import type { DetectionResultData } from './dashboardTypes'

function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`
}

export default function DetectionResult({ result }: { result: DetectionResultData | null }) {
  const hasSpecies = Boolean(result?.species)

  return (
    <section className="resultCard" aria-label="Resultado de detección">
      <div className="resultHeading">
        <span className={hasSpecies ? 'resultIcon resultSuccess' : 'resultIcon'}>
          {hasSpecies ? <CheckCircle2 size={24} /> : <SearchX size={24} />}
        </span>
        <div>
          <h2>Resultado del análisis</h2>
          <p>{result ? 'Predicción generada para la imagen cargada.' : 'Aún no hay una imagen analizada.'}</p>
        </div>
      </div>

      {result ? (
        <div className="resultGrid">
          <div>
            <span>Especie detectada</span>
            <strong>{result.species || 'No se detectó ningún animal'}</strong>
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
      ) : (
        <div className="emptyResult">
          <AlertTriangle size={20} />
          <span>Selecciona una imagen y presiona Analizar imagen para ver la detección.</span>
        </div>
      )}

      {result?.message ? <p className="resultMessage">{result.message}</p> : null}
    </section>
  )
}
