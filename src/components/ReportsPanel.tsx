'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { getSpeciesLabel, type Language, type UiText } from '@/lib/i18n'
import type { DashboardMetric, Priority, RecentDetection } from './dashboardTypes'
import StatsCards from './StatsCards'

type DetectionsResponse = {
  currentUser?: {
    id: number
    role: string
  }
  detections: RecentDetection[]
}

type PeriodFilter = '7' | '30' | '90' | 'all'

const priorityOrder: Priority[] = ['Alta prioridad', 'Revision manual', 'Normal']

function isPositiveDetection(detection: RecentDetection) {
  return detection.species !== 'Sin deteccion' && detection.confidence > 0
}

function isWithinPeriod(detection: RecentDetection, period: PeriodFilter) {
  if (period === 'all') {
    return true
  }

  const createdAt = new Date(detection.createdAt)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - Number(period))

  return createdAt >= cutoff
}

function countBy<T extends string>(items: RecentDetection[], getKey: (item: RecentDetection) => T | null | undefined) {
  const counts = new Map<T, number>()

  for (const item of items) {
    const key = getKey(item)

    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
}

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function exportDetectionsCsv(detections: RecentDetection[], language: Language) {
  const headers = ['fecha', 'especie', 'confianza', 'prioridad', 'ubicacion', 'investigador', 'imagen']
  const rows = detections.map((detection) => [
    new Date(detection.createdAt).toLocaleString(language === 'es' ? 'es-ES' : 'en-US'),
    getSpeciesLabel(detection.species, language),
    detection.confidence,
    detection.priority,
    detection.location,
    detection.researcher ?? '',
    detection.imagePath
  ])
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `reporte-detecciones-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function fetchAllDetections() {
  const response = await fetch('/api/detections?limit=all', { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('No se pudieron cargar los datos del reporte')
  }

  return (await response.json()) as DetectionsResponse
}

export default function ReportsPanel({
  language,
  seedDetections,
  text
}: {
  language: Language
  seedDetections: RecentDetection[]
  text: UiText
}) {
  const [detections, setDetections] = useState(seedDetections)
  const [error, setError] = useState('')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [speciesFilter, setSpeciesFilter] = useState('')

  useEffect(() => {
    fetchAllDetections()
      .then((data) => setDetections(data.detections))
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando reportes')
      })
  }, [])

  const filteredDetections = useMemo(
    () =>
      detections.filter((detection) => {
        const matchesPeriod = isWithinPeriod(detection, periodFilter)
        const matchesSpecies = speciesFilter ? detection.species === speciesFilter : true
        const matchesPriority = priorityFilter ? detection.priority === priorityFilter : true

        return matchesPeriod && matchesSpecies && matchesPriority
      }),
    [detections, periodFilter, priorityFilter, speciesFilter]
  )

  const positiveDetections = useMemo(() => filteredDetections.filter(isPositiveDetection), [filteredDetections])
  const speciesOptions = useMemo(
    () =>
      Array.from(new Set(detections.map((detection) => detection.species)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [detections]
  )
  const speciesCounts = useMemo(
    () => countBy(positiveDetections, (detection) => detection.species).slice(0, 6),
    [positiveDetections]
  )
  const totalSpeciesCount = useMemo(
    () => new Set(positiveDetections.map((detection) => detection.species).filter(Boolean)).size,
    [positiveDetections]
  )
  const priorityCounts = useMemo(
    () =>
      priorityOrder.map((priority) => [
        priority,
        filteredDetections.filter((detection) => detection.priority === priority).length
      ] as const),
    [filteredDetections]
  )
  const researcherCounts = useMemo(
    () =>
      countBy(filteredDetections, (detection) => detection.researcher ?? null)
        .filter(([researcher]) => researcher !== 'Sin investigador')
        .slice(0, 5),
    [filteredDetections]
  )
  const priorityFindings = useMemo(
    () => filteredDetections.filter((detection) => detection.priority === 'Alta prioridad').slice(0, 5),
    [filteredDetections]
  )
  const totalPriorityFindings = useMemo(
    () => filteredDetections.filter((detection) => detection.priority === 'Alta prioridad').length,
    [filteredDetections]
  )

  const metrics = useMemo<DashboardMetric[]>(
    () => [
      {
        label: 'Imagenes analizadas',
        value: filteredDetections.length.toString(),
        detail: 'Registros en el periodo'
      },
      {
        label: 'Total de detecciones',
        value: positiveDetections.length.toString(),
        detail: 'Imagenes con animal detectado'
      },
      {
        label: 'Especies detectadas',
        value: totalSpeciesCount.toString(),
        detail: 'Especies distintas del reporte'
      },
      {
        label: 'Alta prioridad',
        value: totalPriorityFindings.toString(),
        detail: 'Casos para revision'
      }
    ],
    [filteredDetections.length, positiveDetections.length, totalPriorityFindings, totalSpeciesCount]
  )

  return (
    <section className="reportsView" aria-label={text.reports}>
      {error ? <div className="statusBanner">{error}</div> : null}

      <section className="reportToolbar" aria-label="Filtros de reporte">
        <label>
          <span>Periodo</span>
          <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}>
            <option value="7">Ultimos 7 dias</option>
            <option value="30">Ultimos 30 dias</option>
            <option value="90">Ultimos 90 dias</option>
            <option value="all">Todo el historial</option>
          </select>
        </label>

        <label>
          <span>Especie</span>
          <select value={speciesFilter} onChange={(event) => setSpeciesFilter(event.target.value)}>
            <option value="">Todas</option>
            {speciesOptions.map((species) => (
              <option key={species} value={species}>
                {getSpeciesLabel(species, language)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Prioridad</span>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
            <option value="">Todas</option>
            {priorityOrder.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>

        <div className="reportActions">
          <button className="secondaryButton" onClick={() => exportDetectionsCsv(filteredDetections, language)} type="button">
            <Download size={17} />
            CSV
          </button>
          <button className="secondaryButton" onClick={() => window.print()} type="button">
            <Printer size={17} />
            Imprimir
          </button>
        </div>
      </section>

      <StatsCards metrics={metrics} text={text} />

      <div className="reportGrid">
        <section className="reportPanel">
          <div className="panelHeader">
            <h2>Especies mas registradas</h2>
          </div>
          <div className="reportList">
            {speciesCounts.length > 0 ? (
              speciesCounts.map(([species, count]) => (
                <div className="reportRow" key={species}>
                  <span>{getSpeciesLabel(species, language)}</span>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <div className="emptyState">Sin detecciones positivas en el periodo.</div>
            )}
          </div>
        </section>

        <section className="reportPanel">
          <div className="panelHeader">
            <h2>Distribucion por prioridad</h2>
          </div>
          <div className="reportList">
            {priorityCounts.map(([priority, count]) => (
              <div className="reportRow" key={priority}>
                <span>{priority}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="reportPanel">
          <div className="panelHeader">
            <h2>Actividad por investigador</h2>
          </div>
          <div className="reportList">
            {researcherCounts.length > 0 ? (
              researcherCounts.map(([researcher, count]) => (
                <div className="reportRow" key={researcher}>
                  <span>{researcher}</span>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <div className="emptyState">Sin datos de investigador para este filtro.</div>
            )}
          </div>
        </section>

        <section className="reportPanel">
          <div className="panelHeader">
            <h2>Hallazgos prioritarios</h2>
          </div>
          <div className="reportList">
            {priorityFindings.length > 0 ? (
              priorityFindings.map((detection) => (
                <div className="reportFinding" key={detection.id}>
                  <strong>{getSpeciesLabel(detection.species, language)}</strong>
                  <span>{detection.location}</span>
                  <time dateTime={detection.createdAt}>
                    {new Date(detection.createdAt).toLocaleDateString('es-ES', { dateStyle: 'medium' })}
                  </time>
                </div>
              ))
            ) : (
              <div className="emptyState">No hay hallazgos de alta prioridad.</div>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
