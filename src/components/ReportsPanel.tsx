'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart as BarChartIcon,
  CalendarDays,
  Camera,
  ChevronDown,
  FileDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  ImageDown,
  LineChart as LineChartIcon,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TableProperties
} from 'lucide-react'
import {
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Line as RechartsLine,
  LineChart as RechartsLineChart,
  Pie as RechartsPie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { getSpeciesLabel, type Language, type UiText } from '@/lib/i18n'
import type { CameraSummary, Priority, RecentDetection } from './dashboardTypes'

type PeriodFilter = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'month' | 'year' | 'all' | 'custom'
type ReviewStatusFilter = 'all' | 'pending' | 'reviewed' | 'unreviewed'

type ChartDatum = { name: string; value: number; percentage?: number }
type TimelineDatum = { date: string; value: number }
type HeatmapDay = { day: number; hours: Array<{ hour: number; value: number }> }
type SpeciesReportRow = {
  species: string
  group: string
  count: number
  percentage: number
  averageConfidence: number
  cameras: string[]
  peakActivityRange: string
  firstCapture: string | null
  lastCapture: string | null
}

type ReportsResponse = {
  filters: {
    cameraIds: number[]
    dateFrom: string | null
    dateTo: string | null
    period: PeriodFilter
    periodLabel: string
    taxonomyGroups: string[]
    species: string[]
    priorities: string[]
    minConfidence: number
    reviewStatus: ReviewStatusFilter
    dateField: 'capturedAt'
  }
  summary: {
    processedImages: number
    animalDetections: number
    withoutDetection: number
    distinctSpecies: number
    highPriority: number
    pendingReviews: number
    recordsWithoutCaptureDate: number
  }
  executive: {
    period: string
    cameras: string
    dominantGroup: string | null
    dominantSpecies: string | null
    peakActivityRange: string | null
    topCamera: string | null
  }
  taxonomyDistribution: ChartDatum[]
  speciesDistribution: ChartDatum[]
  cameraDistribution: ChartDatum[]
  priorityDistribution: ChartDatum[]
  hourlyActivity: ChartDatum[]
  dailyActivity: TimelineDatum[]
  heatmap: HeatmapDay[]
  speciesTable: SpeciesReportRow[]
  availableCameras: Array<Pick<CameraSummary, 'id' | 'code' | 'name' | 'zone'>>
  availableSpecies: string[]
  notes: { captureDate: string; withoutDetection: string }
}

type CamerasResponse = { cameras: CameraSummary[] }

type ReportFilters = {
  cameraIds: number[]
  period: PeriodFilter
  from: string
  to: string
  taxonomicGroups: string[]
  species: string[]
  priorities: string[]
  minConfidence: number
  reviewStatus: ReviewStatusFilter
}

const periods: Array<{ label: string; value: PeriodFilter }> = [
  { label: 'Hoy', value: 'today' },
  { label: 'Ayer', value: 'yesterday' },
  { label: 'Ultimos 7 dias', value: '7d' },
  { label: 'Ultimos 30 dias', value: '30d' },
  { label: 'Ultimos 90 dias', value: '90d' },
  { label: 'Este mes', value: 'month' },
  { label: 'Este anio', value: 'year' },
  { label: 'Todo el historial', value: 'all' },
  { label: 'Personalizado', value: 'custom' }
]

const reportTaxonomicGroups = ['Mamifero', 'Ave', 'Reptil', 'Anfibio', 'Pez', 'Invertebrado', 'Otro', 'Sin clasificar']
const priorities: Priority[] = ['Alta prioridad', 'Revision manual', 'Normal']
const reviewStatuses: Array<{ label: string; value: ReviewStatusFilter }> = [
  { label: 'Todos', value: 'all' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Revisados', value: 'reviewed' },
  { label: 'Sin revisar', value: 'unreviewed' }
]
const chartPalette = ['#7ED9BA', '#A7D7A0', '#B8D3F2', '#F3DE91', '#C9D7E8', '#D8C6E8', '#DDE5DF', '#BFD8CA']
const dayLabels = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

function formatNumber(value: number) {
  return value.toLocaleString('es-ES')
}

function formatDate(value: string | null, language: Language) {
  if (!value) return 'Sin fecha de captura'
  return new Date(value).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium' })
}

function normalizeForSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function buildQuery(filters: ReportFilters) {
  const params = new URLSearchParams()
  params.set('period', filters.period)
  if (filters.cameraIds.length > 0) params.set('cameraIds', filters.cameraIds.join(','))
  if (filters.period === 'custom') {
    if (filters.from) params.set('dateFrom', filters.from)
    if (filters.to) params.set('dateTo', filters.to)
  }
  if (filters.taxonomicGroups.length > 0) params.set('taxonomyGroups', filters.taxonomicGroups.join(','))
  if (filters.species.length > 0) params.set('species', filters.species.join(','))
  if (filters.priorities.length > 0) params.set('priorities', filters.priorities.join(','))
  if (filters.minConfidence > 0) params.set('minConfidence', String(filters.minConfidence))
  if (filters.reviewStatus !== 'all') params.set('reviewStatus', filters.reviewStatus)
  return params.toString()
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function exportCsv(rows: SpeciesReportRow[]) {
  const headers = ['especie', 'grupo', 'registros', 'porcentaje', 'confianza_promedio', 'camaras', 'horario_principal', 'primera_captura', 'ultima_captura']
  const csvRows = rows.map((row) => [row.species, row.group, row.count, `${row.percentage}%`, `${row.averageConfidence}%`, row.cameras.join(' | '), row.peakActivityRange, row.firstCapture ?? '', row.lastCapture ?? ''])
  downloadBlob([headers, ...csvRows].map((row) => row.map(escapeCsv).join(',')).join('\n'), 'reporte-wildlifeai.csv', 'text/csv;charset=utf-8')
}

function exportExcel(rows: SpeciesReportRow[]) {
  const tableRows = rows.map((row) => `<tr><td>${row.species}</td><td>${row.group}</td><td>${row.count}</td><td>${row.percentage}%</td><td>${row.averageConfidence}%</td><td>${row.cameras.join(', ')}</td><td>${row.peakActivityRange}</td><td>${row.firstCapture ?? ''}</td><td>${row.lastCapture ?? ''}</td></tr>`).join('')
  const html = `<table><thead><tr><th>Especie</th><th>Grupo</th><th>Registros</th><th>Porcentaje</th><th>Confianza promedio</th><th>Camaras</th><th>Horario principal</th><th>Primera captura</th><th>Ultima captura</th></tr></thead><tbody>${tableRows}</tbody></table>`
  downloadBlob(html, 'reporte-wildlifeai.xls', 'application/vnd.ms-excel;charset=utf-8')
}

function exportPng(report: ReportsResponse | null) {
  if (!report) throw new Error('No hay reporte para exportar')
  const canvas = document.createElement('canvas')
  canvas.width = 1400
  canvas.height = 900
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas no disponible')

  context.fillStyle = '#f7faf6'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#0f3d2e'
  context.font = '700 34px Arial'
  context.fillText('Centro de Reportes WildlifeAI', 56, 70)
  context.fillStyle = '#59645f'
  context.font = '18px Arial'
  context.fillText(`${report.executive.period} | ${report.executive.cameras}`, 56, 104)

  const metrics = [
    ['Imagenes procesadas', report.summary.processedImages],
    ['Detecciones con fauna', report.summary.animalDetections],
    ['Imagenes sin deteccion', report.summary.withoutDetection],
    ['Especies encontradas', report.summary.distinctSpecies],
    ['Revisiones pendientes', report.summary.pendingReviews]
  ]
  metrics.forEach(([label, value], index) => {
    const x = 56 + index * 255
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#dce5df'
    context.lineWidth = 1
    context.beginPath()
    context.roundRect(x, 150, 220, 110, 16)
    context.fill()
    context.stroke()
    context.fillStyle = '#59645f'
    context.font = '14px Arial'
    context.fillText(String(label), x + 18, 188)
    context.fillStyle = '#0f3d2e'
    context.font = '700 30px Arial'
    context.fillText(Number(value).toLocaleString('es-ES'), x + 18, 230)
  })

  const chartData = report.speciesDistribution.slice(0, 8)
  const max = Math.max(1, ...chartData.map((item) => item.value))
  context.fillStyle = '#0f3d2e'
  context.font = '700 22px Arial'
  context.fillText('Especies mas frecuentes', 56, 330)
  chartData.forEach((item, index) => {
    const y = 365 + index * 48
    const width = Math.round((item.value / max) * 620)
    context.fillStyle = '#34423b'
    context.font = '15px Arial'
    context.fillText(item.name, 56, y)
    context.fillStyle = chartPalette[index % chartPalette.length]
    context.fillRect(360, y - 16, width, 18)
    context.fillStyle = '#0f3d2e'
    context.font = '700 14px Arial'
    context.fillText(`${item.value} (${item.percentage ?? 0}%)`, 990, y)
  })

  context.fillStyle = '#0f3d2e'
  context.font = '700 22px Arial'
  context.fillText('Nota', 56, 790)
  context.fillStyle = '#59645f'
  context.font = '16px Arial'
  context.fillText(`${report.summary.recordsWithoutCaptureDate.toLocaleString('es-ES')} registros no incluyen fecha de captura y se excluyen de graficos temporales.`, 56, 822)

  canvas.toBlob((blob) => {
    if (!blob) throw new Error('No se pudo generar PNG')
    downloadBlob(blob, 'reporte-wildlifeai.png', 'image/png')
  }, 'image/png')
}

function MultiSelect({ label, options, placeholder, selected, onChange }: { label: string; options: Array<{ label: string; value: string }>; placeholder: string; selected: string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filteredOptions = options.filter((option) => normalizeForSearch(option.label).includes(normalizeForSearch(query)))
  const selectedLabels = options.filter((option) => selected.includes(option.value)).map((option) => option.label)

  function toggleValue(value: string) {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])
  }

  return (
    <div className="reportMultiSelect">
      <span>{label}</span>
      <button aria-expanded={open} className="reportSelectButton" onClick={() => setOpen((current) => !current)} type="button">
        <span>{selected.length > 0 ? selectedLabels.slice(0, 2).join(', ') : placeholder}</span>
        {selected.length > 2 ? <em>+{selected.length - 2}</em> : null}
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="reportSelectMenu">
          <div className="reportSearchBox"><Search size={15} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Buscar..." value={query} /></div>
          <button className="reportSelectAll" onClick={() => onChange([])} type="button">Todas</button>
          <div className="reportOptionList">
            {filteredOptions.map((option) => <label key={option.value}><input checked={selected.includes(option.value)} onChange={() => toggleValue(option.value)} type="checkbox" /><span>{option.label}</span></label>)}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DonutChart({ data, emptyText, title }: { data: ChartDatum[]; emptyText: string; title: string }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <section className="reportCard chartCard">
      <div className="reportCardHeader"><h3>{title}</h3></div>
      {total > 0 ? (
        <div className="reportDonutLayout">
          <ResponsiveContainer height={220} width="100%">
            <RechartsPieChart>
              <Tooltip formatter={(value, name) => [`${formatNumber(Number(value ?? 0))}`, String(name)]} />
              <RechartsPie data={data} dataKey="value" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="#ffffff" strokeWidth={4}>
                {data.map((item, index) => <Cell fill={chartPalette[index % chartPalette.length]} key={item.name} />)}
              </RechartsPie>
            </RechartsPieChart>
          </ResponsiveContainer>
          <div className="reportLegend">
            {data.map((item, index) => <div key={item.name}><i style={{ background: chartPalette[index % chartPalette.length] }} /><span>{item.name}</span><strong>{item.percentage ?? 0}%</strong></div>)}
          </div>
        </div>
      ) : <div className="reportEmptyChart">{emptyText}</div>}
    </section>
  )
}

function BarsPanel({ data, title, icon: Icon }: { data: ChartDatum[]; title: string; icon: typeof BarChartIcon }) {
  return (
    <section className="reportCard chartCard">
      <div className="reportCardHeader"><h3>{title}</h3><Icon size={18} /></div>
      <ResponsiveContainer height={240} width="100%">
        <RechartsBarChart data={data} margin={{ bottom: 16, left: -24, right: 8, top: 8 }}>
          <CartesianGrid stroke="#edf1ef" vertical={false} />
          <XAxis dataKey="name" fontSize={11} tickLine={false} />
          <YAxis allowDecimals={false} fontSize={11} tickLine={false} />
          <Tooltip />
          <RechartsBar dataKey="value" fill="#7ED9BA" radius={[6, 6, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </section>
  )
}

function TimelinePanel({ data }: { data: TimelineDatum[] }) {
  return (
    <section className="reportCard chartCard reportWideCard">
      <div className="reportCardHeader"><h3>Linea temporal por fecha</h3><LineChartIcon size={18} /></div>
      <ResponsiveContainer height={260} width="100%">
        <RechartsLineChart data={data} margin={{ bottom: 16, left: -24, right: 16, top: 8 }}>
          <CartesianGrid stroke="#edf1ef" vertical={false} />
          <XAxis dataKey="date" fontSize={11} tickLine={false} />
          <YAxis allowDecimals={false} fontSize={11} tickLine={false} />
          <Tooltip />
          <RechartsLine dataKey="value" dot={false} stroke="#1f6f55" strokeWidth={3} type="monotone" />
        </RechartsLineChart>
      </ResponsiveContainer>
    </section>
  )
}

function HeatmapPanel({ data }: { data: HeatmapDay[] }) {
  const max = Math.max(1, ...data.flatMap((day) => day.hours.map((hour) => hour.value)))
  return (
    <section className="reportCard chartCard reportWideCard">
      <div className="reportCardHeader"><h3>Heatmap dia vs hora</h3><CalendarDays size={18} /></div>
      <div className="reportHeatmap" role="img" aria-label="Mapa de calor de actividad por dia y hora">
        {data.map((day) => <div className="reportHeatmapRow" key={day.day}><span>{dayLabels[day.day]}</span>{day.hours.map((hour) => <i key={hour.hour} title={`${dayLabels[day.day]} ${hour.hour}:00 - ${hour.value} registros`} style={{ background: `rgba(31, 111, 85, ${0.08 + (hour.value / max) * 0.72})` }} />)}</div>)}
      </div>
    </section>
  )
}

export default function ReportsPanel({ language, seedDetections }: { language: Language; seedDetections: RecentDetection[]; text: UiText }) {
  const [availableCameras, setAvailableCameras] = useState<CameraSummary[]>([])
  const [report, setReport] = useState<ReportsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [filters, setFilters] = useState<ReportFilters>({
    cameraIds: [],
    period: 'all',
    from: '',
    to: '',
    taxonomicGroups: [],
    species: [],
    priorities: [],
    minConfidence: 0,
    reviewStatus: 'all'
  })

  useEffect(() => {
    fetch('/api/cameras', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('No se pudieron cargar las camaras')))
      .then((data: CamerasResponse) => setAvailableCameras(data.cameras))
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Error cargando camaras'))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`/api/reports?${buildQuery(filters)}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('No se pudo recalcular el reporte')))
      .then((data: ReportsResponse) => setReport(data))
      .catch((loadError: unknown) => {
        if ((loadError as Error).name !== 'AbortError') setError(loadError instanceof Error ? loadError.message : 'Error cargando reportes')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [filters])

  const speciesOptions = useMemo(() => {
    const fromSeed = seedDetections.map((detection) => detection.species).filter(Boolean)
    const fromReport = report?.availableSpecies ?? []
    return Array.from(new Set([...fromSeed, ...fromReport])).sort((left, right) => left.localeCompare(right)).map((species) => ({ label: getSpeciesLabel(species, language), value: species }))
  }, [language, report?.availableSpecies, seedDetections])

  const cameraOptions = useMemo(() => availableCameras.map((camera) => ({ label: `${camera.code} - ${camera.name} (${camera.zone})`, value: String(camera.id) })), [availableCameras])
  const summary = report?.summary
  const executive = report?.executive
  const rows = report?.speciesTable ?? []

  function updateFilters(partial: Partial<ReportFilters>) {
    setFilters((current) => ({ ...current, ...partial }))
  }

  return (
    <section className="reportsCenter reportsView" aria-label="Centro de reportes">
      <div className="reportsHero">
        <div><span>REPORTES</span><h1>Centro de Reportes</h1><p>Genera analisis personalizados por camaras, periodos, grupos taxonomicos y especies.</p></div>
        <button className="secondaryButton" onClick={() => updateFilters({ cameraIds: [], period: 'all', from: '', to: '', taxonomicGroups: [], species: [], priorities: [], minConfidence: 0, reviewStatus: 'all' })} type="button"><RefreshCw size={16} />Restablecer</button>
      </div>

      {error ? <div className="statusBanner">{error}</div> : null}
      {exportError ? <div className="statusBanner">{exportError}</div> : null}

      <section className="reportsFilterShell" aria-label="Filtros del centro de reportes">
        <MultiSelect label="Camaras" onChange={(values) => updateFilters({ cameraIds: values.map(Number) })} options={cameraOptions} placeholder="Todas las camaras" selected={filters.cameraIds.map(String)} />
        <label className="reportField"><span>Periodo de captura</span><select value={filters.period} onChange={(event) => updateFilters({ period: event.target.value as PeriodFilter })}>{periods.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}</select></label>
        {filters.period === 'custom' ? <div className="reportDateRange"><label className="reportField"><span>Desde</span><input type="date" value={filters.from} onChange={(event) => updateFilters({ from: event.target.value })} /></label><label className="reportField"><span>Hasta</span><input type="date" value={filters.to} onChange={(event) => updateFilters({ to: event.target.value })} /></label></div> : null}
        <button className="secondaryButton advancedToggle" onClick={() => setShowAdvanced((current) => !current)} type="button"><SlidersHorizontal size={16} />Filtros</button>
        {showAdvanced ? <div className="reportsAdvancedFilters">
          <MultiSelect label="Grupo taxonomico" onChange={(values) => updateFilters({ taxonomicGroups: values })} options={reportTaxonomicGroups.map((group) => ({ label: group, value: group }))} placeholder="Todos" selected={filters.taxonomicGroups} />
          <MultiSelect label="Especies" onChange={(values) => updateFilters({ species: values })} options={speciesOptions} placeholder="Todas" selected={filters.species} />
          <MultiSelect label="Prioridad" onChange={(values) => updateFilters({ priorities: values })} options={priorities.map((priority) => ({ label: priority, value: priority }))} placeholder="Todas" selected={filters.priorities} />
          <label className="reportField"><span>Confianza minima</span><input max="100" min="0" onChange={(event) => updateFilters({ minConfidence: Number(event.target.value) })} type="range" value={filters.minConfidence} /><strong>{filters.minConfidence}%</strong></label>
          <label className="reportField"><span>Estado de revision</span><select value={filters.reviewStatus} onChange={(event) => updateFilters({ reviewStatus: event.target.value as ReviewStatusFilter })}>{reviewStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        </div> : null}
      </section>

      <section className="reportsExportBar" aria-label="Exportaciones">
        <span>{loading ? 'Recalculando reporte...' : `${formatNumber(rows.length)} especies en la tabla cientifica`}</span>
        <div>
          <button className="secondaryButton" onClick={() => window.print()} type="button"><FileText size={16} />PDF</button>
          <button className="secondaryButton" onClick={() => exportExcel(rows)} type="button"><FileSpreadsheet size={16} />Excel</button>
          <button className="secondaryButton" onClick={() => exportCsv(rows)} type="button"><FileDown size={16} />CSV</button>
          <button className="secondaryButton" onClick={() => { try { setExportError(''); exportPng(report) } catch { setExportError('No fue posible exportar el PNG.') } }} type="button"><ImageDown size={16} />PNG</button>
          <button className="secondaryButton" onClick={() => downloadBlob(JSON.stringify(report, null, 2), 'reporte-wildlifeai.json', 'application/json;charset=utf-8')} type="button"><FileJson size={16} />JSON</button>
        </div>
      </section>

      <section className="executiveSummaryCard">
        <div className="reportCardHeader"><h2>Resumen ejecutivo</h2><Filter size={18} /></div>
        {summary && executive && (summary.animalDetections > 0 || summary.processedImages > 0) ? <p>Durante {executive.period.toLowerCase()} se analizaron {formatNumber(summary.processedImages)} imagenes de {executive.cameras}. Se registraron {formatNumber(summary.animalDetections)} detecciones de fauna correspondientes a {formatNumber(summary.distinctSpecies)} especies. {executive.dominantGroup && executive.dominantSpecies ? `El grupo predominante fue ${executive.dominantGroup} y la especie mas frecuente fue ${getSpeciesLabel(executive.dominantSpecies, language)}.` : ''} {executive.peakActivityRange ? `El horario de mayor actividad fue ${executive.peakActivityRange}.` : 'No hay fecha de captura suficiente para calcular actividad horaria.'}</p> : <p>No se encontraron registros para los filtros seleccionados.</p>}
      </section>

      <div className="reportsMetricsGrid">
        <article><Camera size={18} /><span>Imagenes procesadas</span><strong>{formatNumber(summary?.processedImages ?? 0)}</strong></article>
        <article><Search size={18} /><span>Detecciones con fauna</span><strong>{formatNumber(summary?.animalDetections ?? 0)}</strong></article>
        <article><TableProperties size={18} /><span>Especies encontradas</span><strong>{formatNumber(summary?.distinctSpecies ?? 0)}</strong></article>
        <article><CalendarDays size={18} /><span>Horario principal</span><strong>{executive?.peakActivityRange ?? 'Sin fecha de captura'}</strong></article>
      </div>

      <div className="reportsChartsGrid">
        <DonutChart data={report?.taxonomyDistribution ?? []} emptyText="Sin grupos taxonomicos para este filtro." title="Grupos taxonomicos" />
        <DonutChart data={(report?.speciesDistribution ?? []).slice(0, 12)} emptyText="Sin especies para este filtro." title="Especies" />
        <BarsPanel data={report?.cameraDistribution ?? []} icon={BarChartIcon} title="Actividad por camara" />
        <BarsPanel data={report?.hourlyActivity ?? []} icon={CalendarDays} title="Actividad horaria" />
        <TimelinePanel data={report?.dailyActivity ?? []} />
        <HeatmapPanel data={report?.heatmap ?? []} />
        <DonutChart data={report?.priorityDistribution ?? []} emptyText="Sin prioridades para este filtro." title="Prioridades" />
      </div>

      {summary && summary.recordsWithoutCaptureDate > 0 ? <div className="statusBanner neutral">{formatNumber(summary.recordsWithoutCaptureDate)} registros no incluyen fecha de captura; se mantienen en conteos generales y se excluyen de graficos temporales.</div> : null}

      <section className="reportCard scientificTableCard">
        <div className="reportCardHeader"><h2>Tabla cientifica</h2><TableProperties size={18} /></div>
        <div className="scientificTableWrap"><table className="scientificReportTable"><thead><tr><th>Especie</th><th>Grupo</th><th>Registros</th><th>%</th><th>Confianza</th><th>Camaras</th><th>Horario principal</th><th>Primera captura</th><th>Ultima captura</th></tr></thead><tbody>
          {rows.length > 0 ? rows.map((row) => <tr key={row.species}><td><strong>{getSpeciesLabel(row.species, language)}</strong><small>{row.species}</small></td><td>{row.group}</td><td>{formatNumber(row.count)}</td><td>{row.percentage}%</td><td>{row.averageConfidence}%</td><td>{row.cameras.join(', ')}</td><td>{row.peakActivityRange}</td><td>{formatDate(row.firstCapture, language)}</td><td>{formatDate(row.lastCapture, language)}</td></tr>) : <tr><td colSpan={9}>No hay registros que coincidan con los filtros seleccionados.</td></tr>}
        </tbody></table></div>
      </section>
    </section>
  )
}
