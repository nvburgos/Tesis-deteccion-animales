'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import StatsCards from '@/components/StatsCards'
import type { DashboardMetric, RecentDetection } from '@/components/dashboardTypes'

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

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

async function fetchDetections(researcherId = '') {
  const params = new URLSearchParams({ limit: 'all' })

  if (researcherId) {
    params.set('researcherId', researcherId)
  }

  const response = await fetch(`/api/detections?${params.toString()}`, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('No se pudieron cargar las estadisticas')
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

export default function EstadisticasPage() {
  const [detections, setDetections] = useState<RecentDetection[]>([])
  const [investigators, setInvestigators] = useState<Investigator[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [researcherFilter, setResearcherFilter] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDetections(researcherFilter)
      .then((data) => {
        const userIsAdmin = data.currentUser?.role === 'Admin'

        setDetections(data.detections)
        setIsAdmin(userIsAdmin)

        if (userIsAdmin) {
          fetchInvestigators().then((investigatorData) => setInvestigators(investigatorData.investigators))
        }
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando estadisticas')
      })
  }, [researcherFilter])

  const detectedRows = useMemo(
    () => detections.filter((detection) => detection.species !== 'Sin deteccion' && detection.confidence > 0),
    [detections]
  )

  const speciesCounts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const detection of detectedRows) {
      counts.set(detection.species, (counts.get(detection.species) ?? 0) + 1)
    }

    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [detectedRows])

  const metrics = useMemo<DashboardMetric[]>(() => {
    const averageConfidence =
      detectedRows.length > 0
        ? detectedRows.reduce((total, detection) => total + detection.confidence, 0) / detectedRows.length
        : 0

    return [
      {
        label: 'Total de imagenes analizadas',
        value: detections.length.toString(),
        detail: 'Registros procesados'
      },
      {
        label: 'Total de detecciones',
        value: detectedRows.length.toString(),
        detail: 'Imagenes con animal detectado'
      },
      {
        label: 'Especies detectadas',
        value: speciesCounts.length.toString(),
        detail: 'Especies distintas encontradas'
      },
      {
        label: 'Confianza promedio',
        value: formatPercent(averageConfidence),
        detail: 'Promedio sobre detecciones positivas'
      }
    ]
  }, [detectedRows, detections.length, speciesCounts.length])

  return (
    <main className="dashboardShell">
      <Sidebar />
      <section className="dashboardMain">
        <Header
          title="Estadisticas del modelo"
          subtitle="Resumen operativo de imagenes analizadas, detecciones y confianza"
        />

        <div className="contentArea">
          {error ? <div className="statusBanner">{error}</div> : null}

          {isAdmin ? (
            <section className="filterPanel" aria-label="Filtro por investigador">
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
            </section>
          ) : null}

          <StatsCards metrics={metrics} />

          <section className="statsPanel">
            <div className="panelHeader">
              <h2>Detecciones por especie</h2>
            </div>

            <div className="speciesStatsList">
              {speciesCounts.length > 0 ? (
                speciesCounts.map(([species, count]) => (
                  <div className="speciesStatRow" key={species}>
                    <span>{species}</span>
                    <strong>{count}</strong>
                  </div>
                ))
              ) : (
                <div className="emptyState">Aun no hay detecciones positivas para graficar.</div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
