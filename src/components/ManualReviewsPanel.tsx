'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck } from 'lucide-react'
import { getSpeciesLabel, type Language, type UiText } from '@/lib/i18n'
import type { RecentDetection } from './dashboardTypes'

async function completeManualReview(detectionId: number, species: string, note: string) {
  const response = await fetch('/api/detections', {
    body: JSON.stringify({ detectionId, note, species }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH'
  })
  const data = (await response.json().catch(() => null)) as { detection?: RecentDetection; error?: string } | null

  if (!response.ok || !data?.detection) {
    throw new Error(data?.error ?? 'No se pudo completar la revision')
  }

  return data.detection
}

export default function ManualReviewsPanel({
  detections,
  language,
  onReviewCompleted,
  text
}: {
  detections: RecentDetection[]
  language: Language
  onReviewCompleted: (detection: RecentDetection) => void
  text: UiText
}) {
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [speciesByDetection, setSpeciesByDetection] = useState<Record<number, string>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  const pendingReviews = useMemo(
    () =>
      detections
        .filter((detection) => detection.priority === 'Revision manual' && !detection.manualReviewedAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [detections]
  )

  async function handleCompleteReview(detectionId: number) {
    setSavingId(detectionId)
    setError('')

    try {
      const detection = pendingReviews.find((pendingReview) => pendingReview.id === detectionId)
      const species = speciesByDetection[detectionId] ?? (detection?.species === 'Sin deteccion' ? '' : detection?.species) ?? ''
      const updatedDetection = await completeManualReview(detectionId, species, notes[detectionId] ?? '')
      onReviewCompleted(updatedDetection)
      setNotes((currentNotes) => {
        const nextNotes = { ...currentNotes }
        delete nextNotes[detectionId]
        return nextNotes
      })
      setSpeciesByDetection((currentSpecies) => {
        const nextSpecies = { ...currentSpecies }
        delete nextSpecies[detectionId]
        return nextSpecies
      })
    } catch (reviewError: unknown) {
      setError(reviewError instanceof Error ? reviewError.message : 'Error completando la revision')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="manualReviewsView" aria-label={text.reviews}>
      {error ? <div className="statusBanner">{error}</div> : null}

      <section className="reviewsHero">
        <span className="reviewsHeroIcon" aria-hidden="true">
          <ClipboardCheck size={30} />
        </span>
        <div>
          <h2>Revisiones manuales pendientes</h2>
          <p>Valida los casos donde el modelo detecto incertidumbre o no asigno una especie clara.</p>
        </div>
        <strong>{pendingReviews.length}</strong>
      </section>

      <div className="reviewList">
        {pendingReviews.length > 0 ? (
          pendingReviews.map((detection) => {
            const speciesLabel = getSpeciesLabel(detection.species, language)

            return (
              <article className="reviewCard" key={detection.id}>
                <div className="reviewImageWrap">
                  {detection.imagePath ? (
                    <img alt={`Revision: ${speciesLabel}`} src={detection.imagePath} />
                  ) : (
                    <span className="wildlifeThumb" aria-hidden="true" />
                  )}
                </div>

                <div className="reviewBody">
                  <div className="reviewMeta">
                    <span>Revision manual</span>
                    <time dateTime={detection.createdAt}>
                      {new Date(detection.createdAt).toLocaleString(language === 'es' ? 'es-ES' : 'en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </time>
                  </div>

                  <h3>{speciesLabel}</h3>
                  <p>{detection.location}</p>

                  <label className="reviewField">
                    <span>Especie</span>
                    <input
                      onChange={(event) =>
                        setSpeciesByDetection((currentSpecies) => ({
                          ...currentSpecies,
                          [detection.id]: event.target.value
                        }))
                      }
                      placeholder="Ej. Jaguar, Ocelote, Tapir amazonico..."
                      value={speciesByDetection[detection.id] ?? (detection.species === 'Sin deteccion' ? '' : detection.species)}
                    />
                  </label>

                  <label className="reviewNote">
                    <span>Observacion</span>
                    <textarea
                      onChange={(event) =>
                        setNotes((currentNotes) => ({ ...currentNotes, [detection.id]: event.target.value }))
                      }
                      placeholder="Ej. Validado visualmente, requiere contraste con experto, imagen borrosa..."
                      value={notes[detection.id] ?? ''}
                    />
                  </label>

                  <button
                    className="primaryButton reviewCompleteButton"
                    disabled={savingId === detection.id}
                    onClick={() => handleCompleteReview(detection.id)}
                    type="button"
                  >
                    <CheckCircle2 size={18} />
                    {savingId === detection.id ? 'Guardando...' : 'Guardar revision'}
                  </button>
                </div>
              </article>
            )
          })
        ) : (
          <section className="reviewsEmpty">
            <CheckCircle2 size={34} />
            <h2>No hay revisiones pendientes</h2>
            <p>Cuando un analisis requiera validacion manual, aparecera en este apartado.</p>
          </section>
        )}
      </div>
    </section>
  )
}
