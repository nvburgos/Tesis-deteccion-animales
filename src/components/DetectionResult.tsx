'use client'

import { AlertTriangle, CheckCircle2, SearchX } from 'lucide-react'
import Link from 'next/link'
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

function getIndividualLabel(result: DetectionResultData) {
  return result.individual?.label ?? (result.individualId ? `Individuo #${result.individualId}` : null)
}

function formatDateTime(value?: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
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
            {getIndividualLabel(result) ? (
              <div>
                <span>Individuo</span>
                {result.individualId ? (
                  <Link className="individualInlineLink" href={`/individuals/${result.individualId}`}>
                    {getIndividualLabel(result)}
                  </Link>
                ) : (
                  <strong>{getIndividualLabel(result)}</strong>
                )}
                {result.individualMatchStatus ? <small>{result.individualMatchStatus}</small> : null}
              </div>
            ) : null}
            {hasSpecies && result.sameSpeciesStatus ? (
              <div>
                <span>Coincidencia de especie</span>
                <strong>{result.sameSpeciesStatus}</strong>
                {typeof result.previousSameSpeciesCount === 'number' && result.previousSameSpeciesCount > 0 ? (
                  <small>
                    {result.previousSameSpeciesCount} registro{result.previousSameSpeciesCount === 1 ? '' : 's'} previo{result.previousSameSpeciesCount === 1 ? '' : 's'}
                    {result.sameSpeciesLastLocation ? ` · ${result.sameSpeciesLastLocation}` : ''}
                    {formatDateTime(result.sameSpeciesLastDetectedAt) ? ` · ${formatDateTime(result.sameSpeciesLastDetectedAt)}` : ''}
                  </small>
                ) : null}
              </div>
            ) : null}
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
