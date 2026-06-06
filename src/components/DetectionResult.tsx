'use client'

import { AlertTriangle, CheckCircle2, SearchX } from 'lucide-react'
import DetectionImage from './DetectionImage'
import { getSpeciesLabel, uiText, type UiText } from '@/lib/i18n'
import type { DetectionResultData, Language, Priority } from './dashboardTypes'

function formatConfidence(confidence: number) {
  const percent = confidence <= 1 ? confidence * 100 : confidence
  return `${Math.round(percent)}%`
}

function getPriorityLabel(priority: Priority, language: Language) {
  if (language === 'es') {
    return priority
  }

  if (priority === 'Alta prioridad') {
    return 'High priority'
  }

  if (priority === 'Revision manual') {
    return 'Manual review'
  }

  return 'Normal'
}

export default function DetectionResult({
  language = 'es',
  result,
  text = uiText[language]
}: {
  language?: Language
  result: DetectionResultData | null
  text?: UiText
}) {
  const hasSpecies = Boolean(result?.species && result.species !== 'Sin deteccion')
  const speciesLabel = getSpeciesLabel(result?.species, language)

  return (
    <section className="resultCard" aria-label={text.detectionResult}>
      <div className="resultHeading">
        <span className={hasSpecies ? 'resultIcon resultSuccess' : 'resultIcon'}>
          {hasSpecies ? <CheckCircle2 size={24} /> : <SearchX size={24} />}
        </span>
        <div>
          <h2>{text.resultTitle}</h2>
          <p>{result ? text.predictedImage : text.noAnalyzedImage}</p>
        </div>
      </div>

      {result ? (
        <>
          <DetectionImage
            confidence={result.confidence}
            coordinates={result.coordinates}
            imagePath={result.imagePath}
            species={hasSpecies ? speciesLabel : result.species}
          />

          <div className="resultGrid">
            <div>
              <span>{text.speciesDetected}</span>
              <strong>{speciesLabel}</strong>
            </div>
            <div>
              <span>{text.confidence}</span>
              <strong>{formatConfidence(result.confidence)}</strong>
            </div>
            <div>
              <span>{text.priority}</span>
              <strong>{getPriorityLabel(result.priority, language)}</strong>
            </div>
          </div>
        </>
      ) : (
        <div className="emptyResult">
          <AlertTriangle size={20} />
          <span>{text.emptyResult}</span>
        </div>
      )}

      {result?.message ? <p className="resultMessage">{result.message}</p> : null}
    </section>
  )
}
