'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import RecentDetections from '@/components/RecentDetections'
import Sidebar from '@/components/Sidebar'
import type { CameraSummary, RecentDetection } from '@/components/dashboardTypes'

type DetectionsResponse = {
  currentUser?: {
    id: number
    role: string
  }
  detections: RecentDetection[]
}

type Investigator = {
  id: number
  email: string
  institution: string | null
  name: string
}

type InvestigatorsResponse = {
  investigators: Investigator[]
}

type CamerasResponse = {
  cameras: CameraSummary[]
}

async function fetchDetections(researcherId = '', cameraId = '') {
  const params = new URLSearchParams({ limit: 'all' })

  if (researcherId) {
    params.set('researcherId', researcherId)
  }

  if (cameraId) {
    params.set('cameraId', cameraId)
  }

  const response = await fetch(`/api/detections?${params.toString()}`, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('No se pudo cargar el historial')
  }

  return (await response.json()) as DetectionsResponse
}

async function fetchInvestigators() {
  const response = await fetch('/api/investigators', { cache: 'no-store' })

  if (!response.ok) {
    return { investigators: [] }
  }

  return (await response.json()) as InvestigatorsResponse
}

async function fetchCameras() {
  const response = await fetch('/api/cameras', { cache: 'no-store' })

  if (!response.ok) {
    return { cameras: [] }
  }

  return (await response.json()) as CamerasResponse
}

export default function HistorialPage() {
  const [cameras, setCameras] = useState<CameraSummary[]>([])
  const [detections, setDetections] = useState<RecentDetection[]>([])
  const [investigators, setInvestigators] = useState<Investigator[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [cameraFilter, setCameraFilter] = useState('')
  const [researcherFilter, setResearcherFilter] = useState('')
  const [speciesFilter, setSpeciesFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const initialCameraId = new URLSearchParams(window.location.search).get('cameraId') ?? ''
    setCameraFilter(initialCameraId)
    fetchCameras().then((cameraData) => setCameras(cameraData.cameras))
  }, [])

  useEffect(() => {
    fetchDetections(researcherFilter, cameraFilter)
      .then((data) => {
        const userIsAdmin = data.currentUser?.role === 'Admin'

        setDetections(data.detections)
        setIsAdmin(userIsAdmin)

        if (userIsAdmin) {
          fetchInvestigators().then((investigatorData) => setInvestigators(investigatorData.investigators))
        }
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando historial')
      })
  }, [cameraFilter, researcherFilter])

  const speciesOptions = useMemo(
    () =>
      Array.from(new Set(detections.map((detection) => detection.species)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [detections]
  )

  const filteredDetections = useMemo(
    () =>
      detections.filter((detection) => {
        const matchesSpecies = speciesFilter ? detection.species === speciesFilter : true
        const matchesDate = dateFilter ? detection.createdAt.slice(0, 10) === dateFilter : true

        return matchesSpecies && matchesDate
      }),
    [dateFilter, detections, speciesFilter]
  )

  return (
    <main className="dashboardShell">
      <Sidebar />
      <section className="dashboardMain">
        <Header
          title="Historial de detecciones"
          subtitle="Consulta y filtra los analisis realizados por camara, especie y fecha"
        />

        <div className="contentArea">
          {error ? <div className="statusBanner">{error}</div> : null}

          <section className="filterPanel" aria-label="Filtros de historial">
            <label>
              <span>Camara</span>
              <select value={cameraFilter} onChange={(event) => setCameraFilter(event.target.value)}>
                <option value="">Todas las camaras</option>
                {cameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.code} · {camera.zone}
                  </option>
                ))}
              </select>
            </label>

            {isAdmin ? (
              <label>
                <span>Investigador</span>
                <select value={researcherFilter} onChange={(event) => setResearcherFilter(event.target.value)}>
                  <option value="">Todos los investigadores</option>
                  {investigators.map((investigator) => (
                    <option key={investigator.id} value={investigator.id}>
                      {investigator.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label>
              <span>Especie</span>
              <select value={speciesFilter} onChange={(event) => setSpeciesFilter(event.target.value)}>
                <option value="">Todas las especies</option>
                {speciesOptions.map((species) => (
                  <option key={species} value={species}>
                    {species}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Fecha</span>
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            </label>

            <button
              className="secondaryButton"
              onClick={() => {
                setSpeciesFilter('')
                setDateFilter('')
                setResearcherFilter('')
                setCameraFilter('')
              }}
              type="button"
            >
              Limpiar filtros
            </button>
          </section>

          <RecentDetections detections={filteredDetections} showResearcher={isAdmin} />
        </div>
      </section>
    </main>
  )
}
