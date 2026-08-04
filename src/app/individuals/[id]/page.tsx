'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Camera, Images, PawPrint, SearchX } from 'lucide-react'
import { getSpeciesLabel } from '@/lib/i18n'
import type { RecentDetection } from '@/components/dashboardTypes'

type IndividualResponse = {
  detections: RecentDetection[]
  individual: {
    id: number
    label: string | null
    notes: string | null
    species: string
    detectionCount: number
    createdAt: string
    updatedAt: string
  }
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  error?: string
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatConfidence(confidence: number) {
  return `${Math.round(confidence <= 1 ? confidence * 100 : confidence)}%`
}

async function fetchIndividual(id: string, page: number) {
  const response = await fetch(`/api/individuals/${id}?page=${page}&pageSize=24`, { cache: 'no-store' })
  const data = (await response.json().catch(() => null)) as IndividualResponse | null

  if (!response.ok || !data) {
    throw new Error(data?.error ?? 'No se pudo cargar el individuo')
  }

  return data
}

export default function IndividualPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('')
  const [data, setData] = useState<IndividualResponse | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    params.then((resolved) => setId(resolved.id))
  }, [params])

  useEffect(() => {
    if (!id) return

    setIsLoading(true)
    setError('')
    fetchIndividual(id, page)
      .then(setData)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Error cargando individuo'))
      .finally(() => setIsLoading(false))
  }, [id, page])

  const representative = data?.detections[0] ?? null
  const thumbnails = data?.detections.slice(0, 4) ?? []
  const speciesLabel = getSpeciesLabel(data?.individual.species ?? '', 'es')
  const title = data?.individual.label ?? (data?.individual.id ? `Individuo #${data.individual.id}` : 'Individuo')
  const detectionDates = useMemo(
    () => data?.detections.map((detection) => detection.capturedAt ?? detection.createdAt).filter(Boolean) ?? [],
    [data]
  )

  return (
    <main className="individualStandalonePage individualDetailPage">
      <div className="individualDetailTopbar">
        <Link className="individualBackLink" href="/cameras"><ArrowLeft size={16} /> Camaras</Link>
        <Link className="individualBackLink" href="/historial">Historial</Link>
      </div>

      {error ? <div className="statusBanner">{error}</div> : null}

      {data ? (
        <>
          <section className="individualHero">
            <div className="individualHeroMedia">
              {representative ? <img alt={title} className="individualHeroImage" src={representative.imagePath} /> : <div className="individualHeroEmpty"><SearchX size={30} /></div>}
              {thumbnails.length > 1 ? (
                <div className="individualThumbStrip">
                  {thumbnails.map((detection) => <img alt={`${title} miniatura ${detection.id}`} key={detection.id} src={detection.imagePath} />)}
                </div>
              ) : null}
            </div>

            <div className="individualHeroBody">
              <div className="individualEyebrow"><PawPrint size={16} /> {speciesLabel}</div>
              <h1>{title}</h1>
              <div className="individualChips">
                <span><Images size={15} /> {data.individual.detectionCount} foto{data.individual.detectionCount === 1 ? '' : 's'}</span>
                <span><CalendarDays size={15} /> Actualizado {formatDate(data.individual.updatedAt)}</span>
              </div>
              {data.individual.notes ? <p>{data.individual.notes}</p> : <p>Galeria filtrada con las detecciones asignadas a este individuo.</p>}
              <div className="individualHeroStats">
                <article><span>Primer registro</span><strong>{formatDate(detectionDates[detectionDates.length - 1])}</strong></article>
                <article><span>Ultimo registro</span><strong>{formatDate(detectionDates[0])}</strong></article>
                <article><span>Especie</span><strong>{speciesLabel}</strong></article>
              </div>
            </div>
          </section>

          <section className="individualPhotoPanel">
            <div className="speciesEvidenceHeader">
              <strong><Images size={17} /> Fotos de este individuo</strong>
              <span>{data.pagination.total} registro{data.pagination.total === 1 ? '' : 's'}</span>
            </div>
            <div className="individualPhotoGrid">
              {data.detections.map((detection) => (
                <article key={detection.id}>
                  <a href={detection.imagePath} target="_blank" rel="noreferrer">
                    <img alt={`${title} deteccion ${detection.id}`} src={detection.imagePath} />
                  </a>
                  <div>
                    <strong>{formatDate(detection.capturedAt ?? detection.createdAt)}</strong>
                    <span><Camera size={14} /> {detection.camera ? `${detection.camera.code} | ${detection.camera.zone}` : detection.location}</span>
                    <small>Confianza {formatConfidence(detection.confidence)} | {detection.individualMatchStatus ?? 'Sin analisis'}</small>
                    {detection.individualMatchBasis ? <small>{detection.individualMatchBasis}</small> : null}
                  </div>
                </article>
              ))}
            </div>
            <div className="paginationBar">
              <button className="secondaryButton" disabled={data.pagination.page <= 1} onClick={() => setPage((current) => current - 1)} type="button">Anterior</button>
              <span>Pagina {data.pagination.page} de {data.pagination.totalPages}</span>
              <button className="secondaryButton" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => setPage((current) => current + 1)} type="button">Siguiente</button>
            </div>
          </section>
        </>
      ) : (
        <section className="emptyState">{isLoading ? 'Cargando individuo...' : 'No se encontro el individuo.'}</section>
      )}
    </main>
  )
}
