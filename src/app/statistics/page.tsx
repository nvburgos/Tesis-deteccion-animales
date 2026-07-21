'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3, CalendarDays, Camera, CheckCircle2, ChevronDown, Filter, Gauge, PawPrint, RefreshCw, Search, TableProperties } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import { getSpeciesLabel } from '@/lib/i18n'

type PeriodFilter = '7d' | '30d' | '90d' | 'year' | 'all' | 'custom'
type CameraFilter = { id: number; code: string; name: string; zone: string }
type ResearcherFilter = { id: number; name: string; email: string }
type ChartDatum = { name: string; value: number; percentage?: number }
type DailyDatum = { date: string; value: number }
type TopSpeciesRow = { species: string; group: string; records: number; percentage: number; averageConfidence: number; topCamera: string; lastCapture: string | null }
type CameraPerformanceRow = { id: number; code: string; name: string; analyzedImages: number; animalDetections: number; detectionRate: number; distinctSpecies: number }
type StatisticsResponse = {
  summary: { processedImages: number; animalDetections: number; withoutDetection: number; distinctSpecies: number; averageConfidence: number; pendingReviews: number; recordsWithoutCaptureDate: number }
  dailyTrend: DailyDatum[]
  taxonomyDistribution: ChartDatum[]
  topSpecies: TopSpeciesRow[]
  cameraPerformance: CameraPerformanceRow[]
  hourlyActivity: ChartDatum[]
  confidenceDistribution: ChartDatum[]
  findings: { dominantSpecies: string | null; dominantTaxonomyGroup: string | null; topCamera: string | null; peakActivityRange: string | null; averageConfidence: number; pendingReviews: number }
  availableFilters: { cameras: CameraFilter[]; researchers: ResearcherFilter[]; species: string[]; taxonomyGroups: string[] }
  rules: Record<string, string>
}
type Filters = { period: PeriodFilter; dateFrom: string; dateTo: string; cameraIds: string[]; researcherIds: string[]; taxonomyGroups: string[]; species: string; minConfidence: number }

const periods: Array<{ label: string; value: PeriodFilter }> = [
  { label: 'Ultimos 7 dias', value: '7d' },
  { label: 'Ultimos 30 dias', value: '30d' },
  { label: 'Ultimos 90 dias', value: '90d' },
  { label: 'Este anio', value: 'year' },
  { label: 'Todo el historial', value: 'all' },
  { label: 'Personalizado', value: 'custom' }
]
const palette = ['#7ED9BA', '#A7D7A0', '#B8D3F2', '#F3DE91', '#C9D7E8', '#D8C6E8']

function numberFormat(value: number) { return value.toLocaleString('es-ES') }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString('es-ES', { dateStyle: 'medium' }) : 'Sin fecha' }
function normalizeSearch(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() }
function buildQuery(filters: Filters) {
  const params = new URLSearchParams()
  params.set('period', filters.period)
  if (filters.period === 'custom') { if (filters.dateFrom) params.set('dateFrom', filters.dateFrom); if (filters.dateTo) params.set('dateTo', filters.dateTo) }
  if (filters.cameraIds.length) params.set('cameraIds', filters.cameraIds.join(','))
  if (filters.researcherIds.length) params.set('researcherIds', filters.researcherIds.join(','))
  if (filters.taxonomyGroups.length) params.set('taxonomyGroups', filters.taxonomyGroups.join(','))
  if (filters.species) params.set('species', filters.species)
  if (filters.minConfidence > 0) params.set('minConfidence', String(filters.minConfidence))
  return params.toString()
}

function DropdownMultiSelect({ label, values, onChange, options, allLabel, summaryLabel }: { label: string; values: string[]; onChange: (values: string[]) => void; options: Array<{ label: string; value: string }>; allLabel: string; summaryLabel: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filteredOptions = options.filter((option) => normalizeSearch(option.label).includes(normalizeSearch(query)))
  const selectedText = values.length === 0 ? allLabel : values.length === 1 ? options.find((option) => option.value === values[0])?.label ?? summaryLabel.replace('{count}', '1') : summaryLabel.replace('{count}', String(values.length))

  function toggle(value: string) { onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]) }

  return (
    <div className="reportMultiSelect statisticsReportSelect">
      <span>{label}</span>
      <button className="reportSelectButton" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span>{selectedText}</span><ChevronDown size={16} /></button>
      {open ? <div className="reportSelectMenu">
        <div className="reportSearchBox"><Search size={15} /><input placeholder="Buscar..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <button className="reportSelectAll statisticsSelectAll" onClick={() => onChange([])} type="button"><input checked={values.length === 0} readOnly type="checkbox" /><span>{allLabel}</span></button>
        <div className="reportOptionList">{filteredOptions.map((option) => <label key={option.value}><input checked={values.includes(option.value)} readOnly onChange={() => toggle(option.value)} type="checkbox" /><span>{option.label}</span></label>)}</div>
      </div> : null}
    </div>
  )
}

function EmptyChart({ message }: { message: string }) { return <div className="statisticsEmptyChart">{message}</div> }
function SkeletonKpis() { return <section className="statisticsKpiGrid">{Array.from({ length: 6 }, (_, index) => <article className="statisticsSkeleton" key={index}><span /><strong /></article>)}</section> }
function DonutPanel({ title, data }: { title: string; data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return <section className="statisticsCard statisticsChartCard"><div className="statisticsCardHeader"><h2>{title}</h2><PawPrint size={18} /></div>{total > 0 ? <div className="statisticsDonutGrid"><ResponsiveContainer height={230} width="100%"><PieChart><Tooltip /><Pie data={data} dataKey="value" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="#fff" strokeWidth={4}>{data.map((item, index) => <Cell fill={palette[index % palette.length]} key={item.name} />)}</Pie></PieChart></ResponsiveContainer><div className="statisticsLegend">{data.map((item, index) => <div key={item.name}><i style={{ background: palette[index % palette.length] }} /><span>{item.name}</span><strong>{item.value} · {item.percentage ?? 0}%</strong></div>)}</div></div> : <EmptyChart message="No hay detecciones para los filtros seleccionados." />}</section>
}
function BarPanel({ title, data, horizontal = false }: { title: string; data: ChartDatum[]; horizontal?: boolean }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return <section className="statisticsCard statisticsChartCard"><div className="statisticsCardHeader"><h2>{title}</h2><BarChart3 size={18} /></div>{total > 0 ? <ResponsiveContainer height={260} width="100%"><BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ left: horizontal ? 84 : -22, right: 12, top: 8, bottom: 18 }}><CartesianGrid stroke="#edf1ef" vertical={false} />{horizontal ? <><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" fontSize={11} width={92} /></> : <><XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /></>}<Tooltip /><Bar dataKey="value" fill="#7ED9BA" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart message="No hay datos suficientes para graficar." />}</section>
}
function TrendPanel({ data }: { data: DailyDatum[] }) {
  return <section className="statisticsCard statisticsChartCard statisticsWideCard"><div className="statisticsCardHeader"><h2>Detecciones por fecha</h2><Activity size={18} /></div>{data.length > 0 ? <ResponsiveContainer height={300} width="100%"><AreaChart data={data} margin={{ left: -22, right: 14, top: 10, bottom: 16 }}><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#7ED9BA" stopOpacity={0.55} /><stop offset="95%" stopColor="#7ED9BA" stopOpacity={0.05} /></linearGradient></defs><CartesianGrid stroke="#edf1ef" vertical={false} /><XAxis dataKey="date" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Area dataKey="value" fill="url(#trendFill)" stroke="#1f6f55" strokeWidth={3} type="monotone" /></AreaChart></ResponsiveContainer> : <EmptyChart message="No hay fechas de captura disponibles." />}</section>
}

export default function StatisticsPage() {
  const [data, setData] = useState<StatisticsResponse | null>(null)
  const [draftFilters, setDraftFilters] = useState<Filters>({ period: 'all', dateFrom: '', dateTo: '', cameraIds: [], researcherIds: [], taxonomyGroups: [], species: '', minConfidence: 0 })
  const [appliedFilters, setAppliedFilters] = useState(draftFilters)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true); setError('')
    fetch(`/api/statistics?${buildQuery(appliedFilters)}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('No se pudieron cargar las estadisticas')))
      .then((nextData: StatisticsResponse) => setData(nextData))
      .catch((loadError: unknown) => { console.error('Statistics UI error:', loadError); setError(loadError instanceof Error ? loadError.message : 'Error cargando estadisticas') })
      .finally(() => setLoading(false))
  }, [appliedFilters])

  const cameraOptions = useMemo(() => data?.availableFilters.cameras.map((camera) => ({ value: String(camera.id), label: `${camera.code} - ${camera.name}` })) ?? [], [data])
  const researcherOptions = useMemo(() => data?.availableFilters.researchers.map((researcher) => ({ value: String(researcher.id), label: researcher.name })) ?? [], [data])
  const taxonomyOptions = useMemo(() => data?.availableFilters.taxonomyGroups.map((group) => ({ value: group, label: group })) ?? [], [data])
  const speciesOptions = useMemo(() => data?.availableFilters.species ?? [], [data])
  const topSpecies = data?.topSpecies.slice(0, 10) ?? []
  const dominantText = data?.findings.peakActivityRange ? `La mayor actividad se registro entre las ${data.findings.peakActivityRange}.` : 'No hay suficientes fechas de captura para calcular actividad horaria.'
  const hasNoData = !loading && data && data.summary.processedImages === 0 && data.summary.animalDetections === 0 && data.summary.withoutDetection === 0

  function resetFilters() {
    const reset = { period: 'all' as PeriodFilter, dateFrom: '', dateTo: '', cameraIds: [], researcherIds: [], taxonomyGroups: [], species: '', minConfidence: 0 }
    setDraftFilters(reset); setAppliedFilters(reset)
  }

  return <main className="dashboardShell"><Sidebar /><section className="dashboardMain"><Header title="Estadisticas" subtitle="Dashboard visual de tendencias, actividad temporal y rendimiento de camaras." /><div className="contentArea statisticsDashboard">
    {error ? <div className="statusBanner">{error}</div> : null}
    <section className="statisticsFilters reportsLikeFilters" aria-label="Filtros de estadisticas">
      <label className="statisticsFilterControl"><span>Periodo</span><select value={draftFilters.period} onChange={(event) => setDraftFilters((current) => ({ ...current, period: event.target.value as PeriodFilter }))}>{periods.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}</select></label>
      <DropdownMultiSelect label="Camaras" values={draftFilters.cameraIds} onChange={(cameraIds) => setDraftFilters((current) => ({ ...current, cameraIds }))} options={cameraOptions} allLabel="Todas las camaras" summaryLabel="{count} camaras seleccionadas" />
      <DropdownMultiSelect label="Grupo taxonomico" values={draftFilters.taxonomyGroups} onChange={(taxonomyGroups) => setDraftFilters((current) => ({ ...current, taxonomyGroups }))} options={taxonomyOptions} allLabel="Todos los grupos" summaryLabel="{count} grupos seleccionados" />
      <label className="statisticsFilterControl"><span>Especie</span><select value={draftFilters.species} onChange={(event) => setDraftFilters((current) => ({ ...current, species: event.target.value }))}><option value="">Todas las especies</option>{speciesOptions.map((species) => <option key={species} value={species}>{getSpeciesLabel(species, 'es')}</option>)}</select></label>
      {draftFilters.period === 'custom' ? <><label className="statisticsFilterControl"><span>Fecha desde</span><input type="date" value={draftFilters.dateFrom} onChange={(event) => setDraftFilters((current) => ({ ...current, dateFrom: event.target.value }))} /></label><label className="statisticsFilterControl"><span>Fecha hasta</span><input type="date" value={draftFilters.dateTo} onChange={(event) => setDraftFilters((current) => ({ ...current, dateTo: event.target.value }))} /></label></> : null}
      <DropdownMultiSelect label="Investigador" values={draftFilters.researcherIds} onChange={(researcherIds) => setDraftFilters((current) => ({ ...current, researcherIds }))} options={researcherOptions} allLabel="Todos los investigadores" summaryLabel="{count} investigadores seleccionados" />
      <label className="statisticsFilterControl"><span>Confianza minima</span><div className="statisticsRangeControl"><input min="0" max="100" type="range" value={draftFilters.minConfidence} onChange={(event) => setDraftFilters((current) => ({ ...current, minConfidence: Number(event.target.value) }))} /><strong>{draftFilters.minConfidence}%</strong></div></label>
      <div className="statisticsFilterActions"><button className="primaryButton" onClick={() => setAppliedFilters(draftFilters)} type="button"><Filter size={16} />Aplicar filtros</button><button className="secondaryButton" onClick={resetFilters} type="button"><RefreshCw size={16} />Restablecer</button></div>
    </section>

    {loading && !data ? <SkeletonKpis /> : <section className="statisticsKpiGrid" aria-label="KPIs principales"><article><Camera size={18} /><span>Imagenes analizadas</span><strong>{numberFormat(data?.summary.processedImages ?? 0)}</strong></article><article><PawPrint size={18} /><span>Detecciones con fauna</span><strong>{numberFormat(data?.summary.animalDetections ?? 0)}</strong></article><article><CheckCircle2 size={18} /><span>Imagenes sin deteccion</span><strong>{numberFormat(data?.summary.withoutDetection ?? 0)}</strong></article><article><TableProperties size={18} /><span>Especies registradas</span><strong>{numberFormat(data?.summary.distinctSpecies ?? 0)}</strong></article><article><Gauge size={18} /><span>Confianza promedio</span><strong>{data?.summary.averageConfidence ?? 0}%</strong></article><article><CalendarDays size={18} /><span>Revisiones pendientes</span><strong>{numberFormat(data?.summary.pendingReviews ?? 0)}</strong></article></section>}
    {loading && data ? <div className="statusBanner neutral">Actualizando estadisticas...</div> : null}
    {hasNoData ? <div className="statusBanner neutral">No se encontraron registros para los filtros seleccionados.</div> : null}
    {data && data.summary.recordsWithoutCaptureDate > 0 ? <div className="statusBanner neutral">{numberFormat(data.summary.recordsWithoutCaptureDate)} registros no tienen fecha de captura y no se incluyen en los graficos temporales.</div> : null}

    <div className="statisticsGrid"><TrendPanel data={data?.dailyTrend ?? []} /><DonutPanel title="Distribucion por grupo taxonomico" data={data?.taxonomyDistribution ?? []} /><section className="statisticsCard topSpeciesCard"><div className="statisticsCardHeader"><h2>Especies mas detectadas</h2><PawPrint size={18} /></div>{topSpecies.length > 0 ? <div className="topSpeciesTableWrap"><table className="topSpeciesTable"><thead><tr><th>Especie</th><th>Grupo</th><th>Registros</th><th>%</th><th>Confianza</th><th>Camara principal</th><th>Ultima captura</th></tr></thead><tbody>{topSpecies.map((row) => <tr key={row.species}><td>{getSpeciesLabel(row.species, 'es')}</td><td>{row.group}</td><td>{row.records}</td><td>{row.percentage}%</td><td>{row.averageConfidence}%</td><td>{row.topCamera}</td><td>{formatDate(row.lastCapture)}</td></tr>)}</tbody></table>{(data?.topSpecies.length ?? 0) > 10 ? <button className="secondaryButton" type="button">Ver todas</button> : null}</div> : <EmptyChart message="No hay detecciones para los filtros seleccionados." />}</section><BarPanel title="Actividad por hora de captura" data={data?.hourlyActivity ?? []} /><section className="statisticsCard cameraPerformanceCard"><div className="statisticsCardHeader"><h2>Actividad por camara</h2><Camera size={18} /></div>{(data?.cameraPerformance.length ?? 0) > 0 ? <div className="cameraPerformanceList">{data?.cameraPerformance.map((camera) => <div className="cameraPerformanceRow" key={camera.id || camera.name}><div><strong>{camera.code}</strong><span>{camera.name}</span></div><em>{camera.animalDetections}/{camera.analyzedImages} fauna</em><b>{camera.detectionRate}%</b><small>{camera.distinctSpecies} especies</small></div>)}</div> : <EmptyChart message="No hay datos por camara." />}</section><BarPanel title="Confianza del modelo" data={data?.confidenceDistribution ?? []} /><section className="statisticsCard findingsCard"><div className="statisticsCardHeader"><h2>Hallazgos del periodo</h2><Activity size={18} /></div><div className="findingsList"><div><span>Especie dominante</span><strong>{data?.findings.dominantSpecies ? getSpeciesLabel(data.findings.dominantSpecies, 'es') : 'Sin datos'}</strong></div><div><span>Grupo predominante</span><strong>{data?.findings.dominantTaxonomyGroup ?? 'Sin datos'}</strong></div><div><span>Camara con mayor actividad</span><strong>{data?.findings.topCamera ?? 'Sin datos'}</strong></div><div><span>Horario principal</span><strong>{data?.findings.peakActivityRange ?? 'Sin fecha'}</strong></div><div><span>Confianza promedio</span><strong>{data?.findings.averageConfidence ?? 0}%</strong></div><div><span>Revisiones pendientes</span><strong>{numberFormat(data?.findings.pendingReviews ?? 0)}</strong></div></div><p>{dominantText}</p></section></div>
  </div></section></main>
}
