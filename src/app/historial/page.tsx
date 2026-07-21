'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import RecentDetections from '@/components/RecentDetections'
import Sidebar from '@/components/Sidebar'
import type { CameraSummary, RecentDetection } from '@/components/dashboardTypes'

type Pagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type DetectionsResponse = {
  availableSpecies?: string[]
  currentUser?: {
    id: number
    role: string
  }
  detections: RecentDetection[]
  pagination?: Pagination
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

async function fetchDetections({
  cameraId,
  date,
  page,
  pageSize,
  researcherId,
  species
}: {
  cameraId: string
  date: string
  page: number
  pageSize: number
  researcherId: string
  species: string
}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })

  if (researcherId) params.set('researcherId', researcherId)
  if (cameraId) params.set('cameraId', cameraId)
  if (species) params.set('species', species)
  if (date) params.set('date', date)

  const response = await fetch(`/api/detections?${params.toString()}`, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('No se pudo cargar el historial')
  }

  return (await response.json()) as DetectionsResponse
}

async function fetchInvestigators() {
  const response = await fetch('/api/investigators', { cache: 'no-store' })
  if (!response.ok) return { investigators: [] }
  return (await response.json()) as InvestigatorsResponse
}

async function fetchCameras() {
  const response = await fetch('/api/cameras', { cache: 'no-store' })
  if (!response.ok) return { cameras: [] }
  return (await response.json()) as CamerasResponse
}

export default function HistorialPage() {
  const [availableSpecies, setAvailableSpecies] = useState<string[]>([])
  const [cameras, setCameras] = useState<CameraSummary[]>([])
  const [detections, setDetections] = useState<RecentDetection[]>([])
  const [investigators, setInvestigators] = useState<Investigator[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [cameraFilter, setCameraFilter] = useState('')
  const [researcherFilter, setResearcherFilter] = useState('')
  const [speciesFilter, setSpeciesFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, totalPages: 1 })

  useEffect(() => {
    const initialCameraId = new URLSearchParams(window.location.search).get('cameraId') ?? ''
    setCameraFilter(initialCameraId)
    fetchCameras().then((cameraData) => setCameras(cameraData.cameras))
  }, [])

  useEffect(() => {
    setIsLoading(true)
    setError('')
    fetchDetections({
      cameraId: cameraFilter,
      date: dateFilter,
      page: pagination.page,
      pageSize: pagination.pageSize,
      researcherId: researcherFilter,
      species: speciesFilter
    })
      .then((data) => {
        const userIsAdmin = data.currentUser?.role === 'Admin'
        setDetections(data.detections)
        setAvailableSpecies(data.availableSpecies ?? [])
        setPagination(data.pagination ?? { page: 1, pageSize: pagination.pageSize, total: data.detections.length, totalPages: 1 })
        setIsAdmin(userIsAdmin)

        if (userIsAdmin && investigators.length === 0) {
          fetchInvestigators().then((investigatorData) => setInvestigators(investigatorData.investigators))
        }
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando historial')
      })
      .finally(() => setIsLoading(false))
  }, [cameraFilter, dateFilter, pagination.page, pagination.pageSize, researcherFilter, speciesFilter])

  const speciesOptions = useMemo(
    () => availableSpecies.filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [availableSpecies]
  )

  function resetPage() {
    setPagination((current) => ({ ...current, page: 1 }))
  }

  function clearFilters() {
    setSpeciesFilter('')
    setDateFilter('')
    setResearcherFilter('')
    setCameraFilter('')
    setPagination((current) => ({ ...current, page: 1 }))
  }

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
              <select value={cameraFilter} onChange={(event) => { setCameraFilter(event.target.value); resetPage() }}>
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
                <select value={researcherFilter} onChange={(event) => { setResearcherFilter(event.target.value); resetPage() }}>
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
              <select value={speciesFilter} onChange={(event) => { setSpeciesFilter(event.target.value); resetPage() }}>
                <option value="">Todas las especies</option>
                {speciesOptions.map((species) => (
                  <option key={species} value={species}>
                    {species}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Fecha de procesamiento</span>
              <input type="date" value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); resetPage() }} />
            </label>

            <label>
              <span>Tamano de pagina</span>
              <select value={pagination.pageSize} onChange={(event) => setPagination({ page: 1, pageSize: Number(event.target.value), total: 0, totalPages: 1 })}>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>

            <button className="secondaryButton" onClick={clearFilters} type="button">
              Limpiar filtros
            </button>
          </section>

          {isLoading ? <div className="statusBanner">Cargando historial...</div> : null}

          <RecentDetections detections={detections} showResearcher={isAdmin} />

          <div className="paginationBar" aria-label="Paginacion del historial">
            <button className="secondaryButton" disabled={pagination.page <= 1 || isLoading} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} type="button">
              Anterior
            </button>
            <span>
              Pagina {pagination.page} de {pagination.totalPages} · {pagination.total.toLocaleString('es-ES')} registros
            </span>
            <button className="secondaryButton" disabled={pagination.page >= pagination.totalPages || isLoading} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} type="button">
              Siguiente
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}