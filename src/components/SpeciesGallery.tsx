'use client'

import { useMemo, useState } from 'react'
import { PawPrint } from 'lucide-react'
import { getSpeciesLabel, type UiText } from '@/lib/i18n'
import type { Language, RecentDetection } from './dashboardTypes'

type SpeciesSummary = {
  averageConfidence: number
  count: number
  imagePath: string
  lastSeen: string
  name: string
}

function formatConfidence(confidence: number) {
  return `${Math.round(confidence)}%`
}

function isValidSpecies(detection: RecentDetection) {
  return Boolean(detection.species && detection.species !== 'Sin deteccion')
}

function buildSpeciesSummaries(detections: RecentDetection[]) {
  const summaries = new Map<string, SpeciesSummary & { confidenceTotal: number }>()

  detections.filter(isValidSpecies).forEach((detection) => {
    const existing = summaries.get(detection.species)

    if (!existing) {
      summaries.set(detection.species, {
        averageConfidence: detection.confidence,
        confidenceTotal: detection.confidence,
        count: 1,
        imagePath: detection.imagePath,
        lastSeen: detection.createdAt,
        name: detection.species
      })
      return
    }

    existing.count += 1
    existing.confidenceTotal += detection.confidence
    existing.averageConfidence = existing.confidenceTotal / existing.count

    if (new Date(detection.createdAt) > new Date(existing.lastSeen)) {
      existing.imagePath = detection.imagePath || existing.imagePath
      existing.lastSeen = detection.createdAt
    }
  })

  return Array.from(summaries.values()).sort((left, right) => right.count - left.count)
}

export default function SpeciesGallery({
  detections,
  language,
  text
}: {
  detections: RecentDetection[]
  language: Language
  text: UiText
}) {
  const species = useMemo(() => buildSpeciesSummaries(detections), [detections])
  const [selectedSpecies, setSelectedSpecies] = useState('')
  const activeSpecies = selectedSpecies || species[0]?.name || ''
  const activeSpeciesLabel = getSpeciesLabel(activeSpecies, language)
  const selectedDetections = detections
    .filter((detection) => detection.species === activeSpecies)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  return (
    <section className="speciesPanel" aria-label={text.detectedSpecies}>
      <div className="panelHeader speciesHeader">
        <div>
          <h2>{text.detectedSpecies}</h2>
          <p>{text.reviewPhotos}</p>
        </div>
      </div>

      {species.length > 0 ? (
        <>
          <div className="speciesGrid">
            {species.map((item) => {
              const isActive = item.name === activeSpecies
              const itemLabel = getSpeciesLabel(item.name, language)

              return (
                <button
                  aria-pressed={isActive}
                  className={isActive ? 'speciesCard speciesCardActive' : 'speciesCard'}
                  key={item.name}
                  onClick={() => setSelectedSpecies(item.name)}
                  type="button"
                >
                  <div className="speciesImageWrap">
                    {item.imagePath ? (
                      <img alt={`${text.lastRecord}: ${itemLabel}`} className="speciesImage" src={item.imagePath} />
                    ) : (
                      <div className="speciesImageFallback">
                        <PawPrint size={34} />
                      </div>
                    )}
                  </div>

                  <div className="speciesBody">
                    <div>
                      <span className="speciesMeta">{text.species}</span>
                      <h3>{itemLabel}</h3>
                    </div>

                    <div className="speciesStats">
                      <div>
                        <span>{item.count}</span>
                        <small>{text.detections}</small>
                      </div>
                      <div>
                        <span>{formatConfidence(item.averageConfidence)}</span>
                        <small>{text.confidenceAvg}</small>
                      </div>
                    </div>

                    <time dateTime={item.lastSeen}>
                      {text.lastRecord}: {new Date(item.lastSeen).toLocaleString(language === 'es' ? 'es-ES' : 'en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </time>
                  </div>
                </button>
              )
            })}
          </div>

          <section className="speciesPhotos" aria-label={`${text.photos}: ${activeSpeciesLabel}`}>
            <div className="speciesPhotosHeader">
              <div>
                <span className="speciesMeta">{text.gallery}</span>
                <h3>{activeSpeciesLabel}</h3>
              </div>
              <strong>{selectedDetections.length} {text.photos}</strong>
            </div>

            <div className="speciesPhotoGrid">
              {selectedDetections.map((detection) => {
                const speciesLabel = getSpeciesLabel(detection.species, language)

                return (
                <article className="speciesPhotoCard" key={detection.id}>
                  <img
                    alt={`${speciesLabel} ${language === 'es' ? 'detectado' : 'detected'}`}
                    className="speciesPhoto"
                    src={detection.imagePath}
                  />
                  <div>
                    <strong>{formatConfidence(detection.confidence)}</strong>
                    <time dateTime={detection.createdAt}>
                      {new Date(detection.createdAt).toLocaleString(language === 'es' ? 'es-ES' : 'en-US', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </time>
                  </div>
                </article>
                )
              })}
            </div>
          </section>
        </>
      ) : (
        <div className="speciesEmpty">
          <PawPrint size={34} />
          <span>{text.emptySpecies}</span>
        </div>
      )}
    </section>
  )
}
