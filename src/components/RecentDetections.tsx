'use client'

import Link from 'next/link'
import { getSpeciesLabel, uiText, type UiText } from '@/lib/i18n'
import type { Language, Priority, RecentDetection } from './dashboardTypes'

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

function PriorityBadge({ language, priority }: { language: Language; priority: Priority }) {
  const className =
    priority === 'Alta prioridad'
      ? 'priorityPill priorityHigh'
      : priority === 'Revision manual'
        ? 'priorityPill priorityReview'
        : 'priorityPill priorityNormal'

  return <span className={className}>{getPriorityLabel(priority, language)}</span>
}

function formatConfidence(confidence: number) {
  const percent = confidence <= 1 ? confidence * 100 : confidence
  return `${Math.round(percent)}%`
}

export default function RecentDetections({
  detections,
  language = 'es',
  text = uiText[language]
}: {
  detections: RecentDetection[]
  language?: Language
  text?: UiText
}) {
  return (
    <section className="detectionsPanel" aria-label={text.recentDetections}>
      <div className="panelHeader">
        <h2>{text.recentDetections}</h2>
        <div className="panelActions">
          <button className="secondaryButton" type="button">
            {text.filter}
          </button>
          <button className="secondaryButton" type="button">
            {text.export}
          </button>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>{text.image}</th>
              <th>{text.speciesDetected}</th>
              <th>{text.cameraLocation}</th>
              <th>{text.priority}</th>
              <th>{language === 'es' ? 'Fecha/hora' : 'Date/time'}</th>
              <th>{text.confidence}</th>
            </tr>
          </thead>
          <tbody>
            {detections.length > 0 ? (
              detections.map((detection) => {
                const speciesLabel = getSpeciesLabel(detection.species, language)

                return (
                  <tr key={detection.id}>
                    <td>
                      {detection.imagePath ? (
                        <img
                          alt={`${text.image}: ${speciesLabel}`}
                          className="wildlifeImage"
                          src={detection.imagePath}
                        />
                      ) : (
                        <span className="wildlifeThumb" aria-hidden="true" />
                      )}
                    </td>
                    <td className="speciesCell">{speciesLabel}</td>
                    <td>{detection.location}</td>
                    <td>
                      <PriorityBadge language={language} priority={detection.priority} />
                    </td>
                    <td>
                      <time dateTime={detection.createdAt}>
                        {new Date(detection.createdAt).toLocaleString(language === 'es' ? 'es-ES' : 'en-US', {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </time>
                    </td>
                    <td className="confidenceCell">
                      <span>{formatConfidence(detection.confidence)}</span>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td className="emptyState" colSpan={6}>
                  {text.emptyDetections}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Link className="historyButton" href="/historial">
        {text.history}
      </Link>
    </section>
  )
}
