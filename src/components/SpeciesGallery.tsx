'use client'

import { useMemo, useState } from 'react'
import { PawPrint } from 'lucide-react'
import type { RecentDetection } from './dashboardTypes'

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

export default function SpeciesGallery({ detections }: { detections: RecentDetection[] }) {
  const species = useMemo(() => buildSpeciesSummaries(detections), [detections])
  const [selectedSpecies, setSelectedSpecies] = useState('')
  const activeSpecies = selectedSpecies || species[0]?.name || ''
  const selectedDetections = detections
    .filter((detection) => detection.species === activeSpecies)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  return (
    <section className="speciesPanel" aria-label="Especies detectadas">
      <div className="panelHeader speciesHeader">
        <div>
          <h2>Especies detectadas</h2>
          <p>Selecciona una especie para revisar todas sus fotografias registradas.</p>
        </div>
      </div>

      {species.length > 0 ? (
        <>
          <div className="speciesGrid">
            {species.map((item) => {
              const isActive = item.name === activeSpecies

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
                      <img alt={`Registro de ${item.name}`} className="speciesImage" src={item.imagePath} />
                    ) : (
                      <div className="speciesImageFallback">
                        <PawPrint size={34} />
                      </div>
                    )}
                  </div>

                  <div className="speciesBody">
                    <div>
                      <span className="speciesMeta">Especie</span>
                      <h3>{item.name}</h3>
                    </div>

                    <div className="speciesStats">
                      <div>
                        <span>{item.count}</span>
                        <small>detecciones</small>
                      </div>
                      <div>
                        <span>{formatConfidence(item.averageConfidence)}</span>
                        <small>confianza prom.</small>
                      </div>
                    </div>

                    <time dateTime={item.lastSeen}>
                      Ultimo registro: {new Date(item.lastSeen).toLocaleString('es-ES', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </time>
                  </div>
                </button>
              )
            })}
          </div>

          <section className="speciesPhotos" aria-label={`Fotos de ${activeSpecies}`}>
            <div className="speciesPhotosHeader">
              <div>
                <span className="speciesMeta">Galeria</span>
                <h3>{activeSpecies}</h3>
              </div>
              <strong>{selectedDetections.length} fotos</strong>
            </div>

            <div className="speciesPhotoGrid">
              {selectedDetections.map((detection) => (
                <article className="speciesPhotoCard" key={detection.id}>
                  <img
                    alt={`${detection.species} detectado`}
                    className="speciesPhoto"
                    src={detection.imagePath}
                  />
                  <div>
                    <strong>{formatConfidence(detection.confidence)}</strong>
                    <time dateTime={detection.createdAt}>
                      {new Date(detection.createdAt).toLocaleString('es-ES', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </time>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="speciesEmpty">
          <PawPrint size={34} />
          <span>Aun no hay especies identificadas. Analiza imagenes hasta que SpeciesNet clasifique una especie.</span>
        </div>
      )}
    </section>
  )
}
