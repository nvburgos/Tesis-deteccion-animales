'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  ChartNoAxesColumn,
  FileText,
  Goal,
  Grid2X2,
  Headphones,
  Map,
  Microscope,
  PawPrint,
  Plus,
  Search,
  Sprout,
  UploadCloud,
  type LucideIcon
} from 'lucide-react'

type Priority = 'Alta' | 'Normal'

type Detection = {
  id: number
  imagePath: string
  species: string
  confidence: number
  location: string
  priority: Priority
  createdAt: string
  time: string
}

type DashboardMetric = {
  label: string
  value: string
  detail: string
}

type DashboardData = {
  metrics: DashboardMetric[]
  detections: Detection[]
}

const navItems = [
  { label: 'Panel de Control', icon: Grid2X2, active: true },
  { label: 'Mapa de Campo', icon: Map },
  { label: 'Especies', icon: PawPrint },
  { label: 'Reportes', icon: FileText },
  { label: 'Soporte', icon: Headphones }
]

const metricIcons: Record<string, LucideIcon> = {
  'Imagenes analizadas': ChartNoAxesColumn,
  Especies: Microscope,
  Confianza: Goal
}

const initialData: DashboardData = {
  metrics: [
    { label: 'Imagenes analizadas', value: '0', detail: 'Total de registros procesados' },
    { label: 'Especies', value: '0', detail: 'Especies distintas detectadas' },
    { label: 'Confianza', value: '0%', detail: 'Promedio de confianza YOLO' }
  ],
  detections: []
}

function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Navegacion principal">
      <div className="sidebarBrand">
        <Sprout size={28} />
        <strong>WildlifeAI</strong>
      </div>

      <nav className="sidebarNav">
        {navItems.map((item) => {
          const Icon = item.icon

          return (
            <button className={item.active ? 'navItem active' : 'navItem'} key={item.label} type="button">
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="researcherCard">
        <span className="researcherAvatar" aria-hidden="true" />
        <div>
          <strong>Dra. Elena Rios</strong>
          <span>Investigadora Principal</span>
        </div>
      </div>
    </aside>
  )
}

function Header({
  isUploading,
  onUploadClick
}: {
  isUploading: boolean
  onUploadClick: () => void
}) {
  return (
    <header className="appHeader">
      <div>
        <h1>Estado del Ecosistema</h1>
        <p>Resumen de monitoreo en tiempo real</p>
      </div>

      <div className="headerActions">
        <button className="iconButton" aria-label="Buscar" type="button">
          <Search size={22} />
        </button>
        <button className="iconButton notificationButton" aria-label="Notificaciones" type="button">
          <Bell size={22} />
        </button>
        <button className="primaryButton" disabled={isUploading} onClick={onUploadClick} type="button">
          {isUploading ? <UploadCloud size={18} /> : <Plus size={18} />}
          {isUploading ? 'Analizando...' : 'Nueva Observación'}
        </button>
      </div>
    </header>
  )
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  const Icon = metricIcons[metric.label] ?? ChartNoAxesColumn

  return (
    <article className="metricCard">
      <div className="metricHeading">
        <span>{metric.label}</span>
        <span className="metricIcon">
          <Icon size={23} />
        </span>
      </div>
      <strong>{metric.value}</strong>
      <small>{metric.detail}</small>
    </article>
  )
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priorityPill ${priority === 'Alta' ? 'priorityHigh' : 'priorityNormal'}`}>{priority}</span>
}

function WildlifePreview({ detection }: { detection: Detection }) {
  if (detection.imagePath) {
    return <img alt={`Imagen de ${detection.species}`} className="wildlifeImage" src={detection.imagePath} />
  }

  return <span className="wildlifeThumb" aria-hidden="true" />
}

function DetectionRow({ detection }: { detection: Detection }) {
  const createdAt = new Date(detection.createdAt)

  return (
    <tr>
      <td>
        <WildlifePreview detection={detection} />
      </td>
      <td className="speciesCell">{detection.species}</td>
      <td>{detection.location}</td>
      <td>
        <PriorityBadge priority={detection.priority} />
      </td>
      <td>
        <time dateTime={detection.createdAt} title={createdAt.toLocaleString('es-ES')}>
          {detection.time}
        </time>
      </td>
      <td className="confidenceCell">
        <span>{detection.confidence}%</span>
      </td>
    </tr>
  )
}

function DetectionsTable({ detections }: { detections: Detection[] }) {
  return (
    <section className="detectionsPanel" aria-label="Detecciones recientes">
      <div className="panelHeader">
        <h2>Detecciones recientes</h2>
        <div className="panelActions">
          <button className="secondaryButton" type="button">
            Filtrar
          </button>
          <button className="secondaryButton" type="button">
            Exportar
          </button>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Imagen</th>
              <th>Especie</th>
              <th>Ubicacion</th>
              <th>Prioridad</th>
              <th>Fecha</th>
              <th>Confianza</th>
            </tr>
          </thead>
          <tbody>
            {detections.length > 0 ? (
              detections.map((detection) => <DetectionRow detection={detection} key={detection.id} />)
            ) : (
              <tr>
                <td className="emptyState" colSpan={6}>
                  Aun no hay detecciones. Carga una imagen desde Nueva Observación para iniciar el analisis.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button className="historyButton" type="button">
        Ver todas las detecciones historicas
      </button>
    </section>
  )
}

export default function Dashboard() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [data, setData] = useState<DashboardData>(initialData)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')

  const visibleMetrics = useMemo(() => data.metrics.slice(0, 3), [data.metrics])

  async function loadDetections() {
    const response = await fetch('/api/detections', { cache: 'no-store' })

    if (!response.ok) {
      throw new Error('No se pudieron cargar las detecciones')
    }

    const nextData = (await response.json()) as DashboardData
    setData(nextData)
  }

  useEffect(() => {
    loadDetections()
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando datos')
      })
      .finally(() => setIsLoading(false))
  }, [])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const formData = new FormData()
    formData.append('image', file)
    formData.append('location', 'Camara 01 | Zona Norte')

    setIsUploading(true)
    setError('')

    try {
      const response = await fetch('/api/analyze', {
        body: formData,
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('No se pudo analizar la imagen')
      }

      await loadDetections()
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : 'Error analizando la imagen')
    } finally {
      setIsUploading(false)
      event.target.value = ''
    }
  }

  return (
    <main className="dashboardShell">
      <Sidebar />
      <section className="dashboardMain">
        <Header
          isUploading={isUploading}
          onUploadClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          accept="image/*"
          className="fileInput"
          onChange={handleFileChange}
          type="file"
        />

        <div className="contentArea">
          {error ? <div className="statusBanner">{error}</div> : null}
          {isLoading ? <div className="statusBanner">Cargando datos del ecosistema...</div> : null}

          <section className="metricsGrid" aria-label="Metricas principales">
            {visibleMetrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </section>

          <DetectionsTable detections={data.detections} />
        </div>
      </section>
    </main>
  )
}
