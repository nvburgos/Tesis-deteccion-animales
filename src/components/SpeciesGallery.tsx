'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, Camera, CheckCircle2, ChevronLeft, ChevronRight, Eye, HelpCircle, PawPrint, Pencil, Search, SlidersHorizontal, Users, XCircle } from 'lucide-react'
import type { UiText } from '@/lib/i18n'
import type { CameraSummary, Language, RecentDetection } from './dashboardTypes'

type SpeciesRow = {
  averageConfidence: number
  firstDetectedAt: string | null
  lastDetectedAt: string | null
  recordsWithCaptureDate: number
  recordsWithoutCaptureDate: number
  peakActivityRange: string
  pendingReviews: number
  rawSpecies: string
  records: number
  species: string
  speciesKey: string
  taxonomicGroup: string
  thumbnail: string
}

type SpeciesListResponse = {
  metrics: { totalSpecies: number; totalFaunaRecords: number; recordsWithCaptureDate?: number; recordsWithoutCaptureDate?: number; predominantGroup: string; peakActivityRange: string }
  species: SpeciesRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  limitation: string
  error?: string
}

type SpeciesDetailResponse = {
  camera: Pick<CameraSummary, 'id' | 'code' | 'name' | 'zone'>
  species: {
    name: string
    rawSpecies: string
    taxonomicGroup: string
    records: number
    averageConfidence: number
    firstDetectedAt: string | null
    lastDetectedAt: string | null
    peakActivityRange: string
    topCaptureDay?: { date: string; count: number } | null
    topProcessingDay?: { date: string; count: number } | null
    pendingReviews: number
    recordsWithCaptureDate: number
    recordsWithoutCaptureDate: number
  }
  rangeActivity: Array<{ range: string; count: number }>
  dailyActivity: Array<{ date: string; count: number }>
  individuals: Array<{
    averageConfidence: number
    detectionCount: number
    firstDetectedAt: string | null
    id: number | null
    label: string
    lastDetectedAt: string | null
    matchStatus: string
    representativeDetectionId: number
    representativeImagePath: string
    species: string
  }>
  activityConclusion: string
  detections: RecentDetection[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  limitation: string
  error?: string
}

type SortMode = 'records' | 'recent' | 'confidence' | 'alphabetical'
type IndividualSummary = SpeciesDetailResponse['individuals'][number]
type ComparisonPair = { reference: IndividualSummary; candidate: IndividualSummary }
type ComparisonInsight = { sameCamera: boolean; sameSpecies: boolean; timeGapHours: number; visualSimilarity: number | null }

const groups = ['Mamifero', 'Ave', 'Reptil', 'Anfibio', 'Insecto', 'Otro', 'Sin clasificar']

function formatDate(value: string | null | undefined, withTime = true) {
  if (!value) return 'Sin datos'
  return new Date(value).toLocaleString('es-ES', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' })
}

function formatConfidence(value: number) {
  return `${Math.round(value)}%`
}

function getFilename(path: string) {
  return decodeURIComponent(path.split('/').pop() ?? path)
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as T & { error?: string }
  if (!response.ok || !data) throw new Error(data?.error ?? 'No se pudo cargar la informacion')
  return data
}

export default function SpeciesGallery({
  camera,
  detections,
  onOpenDetection,
  text
}: {
  camera?: CameraSummary
  detections: RecentDetection[]
  language: Language
  onOpenDetection?: (detection: RecentDetection) => void
  text: UiText
}) {
  const [rows, setRows] = useState<SpeciesRow[]>([])
  const [metrics, setMetrics] = useState<SpeciesListResponse['metrics'] | null>(null)
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 })
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<SortMode>('records')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedSpeciesKey, setSelectedSpeciesKey] = useState('')
  const [isDetailMode, setIsDetailMode] = useState(false)
  const [detail, setDetail] = useState<SpeciesDetailResponse | null>(null)
  const [detailPage, setDetailPage] = useState(1)
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [individualNames, setIndividualNames] = useState<Record<number, string>>({})
  const [savingIndividualId, setSavingIndividualId] = useState<number | null>(null)
  const [comparisonPair, setComparisonPair] = useState<ComparisonPair | null>(null)
  const [comparisonInsight, setComparisonInsight] = useState<ComparisonInsight | null>(null)
  const [isComparisonLoading, setIsComparisonLoading] = useState(false)
  const [savingDecision, setSavingDecision] = useState('')
  const [error, setError] = useState('')
  const [limitation, setLimitation] = useState('')

  useEffect(() => {
    if (!camera) {
      const summaries = new Map<string, SpeciesRow & { confidenceTotal: number }>()
      detections.filter((detection) => detection.species && detection.species !== 'Sin deteccion' && detection.confidence > 0).forEach((detection) => {
        const current = summaries.get(detection.species)
        if (!current) {
          summaries.set(detection.species, {
            averageConfidence: detection.confidence,
            confidenceTotal: detection.confidence,
            firstDetectedAt: detection.capturedAt ?? null,
            lastDetectedAt: detection.capturedAt ?? null,
            peakActivityRange: 'Sin datos',
            pendingReviews: detection.manualReviewedAt ? 0 : 1,
            rawSpecies: detection.species,
            records: 1,
            recordsWithCaptureDate: detection.capturedAt ? 1 : 0,
            recordsWithoutCaptureDate: detection.capturedAt ? 0 : 1,
            species: detection.species,
            speciesKey: encodeURIComponent(detection.species),
            taxonomicGroup: 'Sin clasificar',
            thumbnail: detection.imagePath
          })
          return
        }
        current.records += 1
        current.confidenceTotal += detection.confidence
        current.averageConfidence = current.confidenceTotal / current.records
        if (detection.capturedAt) {
          current.recordsWithCaptureDate += 1
          if (!current.firstDetectedAt || new Date(detection.capturedAt) < new Date(current.firstDetectedAt)) current.firstDetectedAt = detection.capturedAt
          if (!current.lastDetectedAt || new Date(detection.capturedAt) > new Date(current.lastDetectedAt)) {
            current.lastDetectedAt = detection.capturedAt
            current.thumbnail = detection.imagePath || current.thumbnail
          }
        } else {
          current.recordsWithoutCaptureDate += 1
        }
      })
      const fallbackRows = [...summaries.values()].sort((left, right) => right.records - left.records)
      setRows(fallbackRows)
      setMetrics({ totalSpecies: fallbackRows.length, totalFaunaRecords: fallbackRows.reduce((sum, row) => sum + row.records, 0), recordsWithCaptureDate: fallbackRows.reduce((sum, row) => sum + row.recordsWithCaptureDate, 0), recordsWithoutCaptureDate: fallbackRows.reduce((sum, row) => sum + row.recordsWithoutCaptureDate, 0), predominantGroup: 'Sin datos', peakActivityRange: 'Sin datos' })
      setPagination((current) => ({ ...current, total: fallbackRows.length, totalPages: 1 }))
      setLimitation('Vista global sin camara seleccionada: se muestran solo las detecciones cargadas en memoria. La actividad temporal requiere Fecha de captura.')
      return
    }

    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(pagination.page), pageSize: String(pagination.pageSize), sort })
    if (query.trim()) params.set('search', query.trim())
    if (group) params.set('group', group)
    if (from) params.set('from', from)
    if (to) params.set('to', to)

    setIsLoading(true)
    setError('')
    fetch(`/api/cameras/${camera.id}/species?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => readJson<SpeciesListResponse>(response))
      .then((data) => {
        setRows(data.species)
        setMetrics(data.metrics)
        setPagination(data.pagination)
        setLimitation(data.limitation)
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el analisis de especies')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [camera, detections, from, group, pagination.page, pagination.pageSize, query, sort, to])

  useEffect(() => {
    if (!camera || !selectedSpeciesKey || !isDetailMode) {
      return
    }

    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(detailPage), pageSize: '12' })
    setIsDetailLoading(true)
    fetch(`/api/cameras/${camera.id}/species/${selectedSpeciesKey}?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => readJson<SpeciesDetailResponse>(response))
      .then((data) => {
        setDetail(data)
        setIndividualNames((current) => {
          const next = { ...current }
          data.individuals.forEach((individual) => {
            if (individual.id && next[individual.id] === undefined) next[individual.id] = individual.label
          })
          return next
        })
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el detalle de especie')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsDetailLoading(false)
      })

    return () => controller.abort()
  }, [camera, detailPage, detailRefreshKey, isDetailMode, selectedSpeciesKey])

  function updatePage(page: number) {
    setPagination((current) => ({ ...current, page }))
  }

  function selectSpecies(row: SpeciesRow) {
    setSelectedSpeciesKey(row.speciesKey)
    setDetailPage(1)
    setDetail(null)
    setIsDetailMode(true)
  }

  function returnToList() {
    setIsDetailMode(false)
    setComparisonPair(null)
    setComparisonInsight(null)
  }

  function startComparison(reference: IndividualSummary) {
    if (!detail) return
    const candidate = detail.individuals.find((individual) => individual.representativeDetectionId !== reference.representativeDetectionId)
    if (!candidate) {
      setError('Se necesita al menos otro individuo supuesto para comparar.')
      return
    }
    setComparisonPair({ reference, candidate })
    setComparisonInsight(null)
    setIsComparisonLoading(true)
    setError('')
    const params = new URLSearchParams({
      candidateDetectionId: String(candidate.representativeDetectionId),
      referenceDetectionId: String(reference.representativeDetectionId)
    })
    fetch(`/api/individuals/review?${params.toString()}`, { cache: 'no-store' })
      .then((response) => readJson<{ comparison: ComparisonInsight }>(response))
      .then((data) => setComparisonInsight(data.comparison))
      .catch((compareError: unknown) => setError(compareError instanceof Error ? compareError.message : 'No se pudo calcular la comparacion visual'))
      .finally(() => setIsComparisonLoading(false))
  }

  async function renameIndividual(individual: IndividualSummary) {
    if (!individual.id) return
    const label = individualNames[individual.id]?.trim()
    if (!label) {
      setError('Escribe un nombre para el individuo.')
      return
    }

    setSavingIndividualId(individual.id)
    setError('')

    try {
      await readJson(await fetch(`/api/individuals/${individual.id}`, {
        body: JSON.stringify({ label }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      }))
      setDetailRefreshKey((current) => current + 1)
    } catch (renameError: unknown) {
      setError(renameError instanceof Error ? renameError.message : 'No se pudo guardar el nombre del individuo')
    } finally {
      setSavingIndividualId(null)
    }
  }

  async function decideComparison(decision: 'same' | 'different' | 'unsure') {
    if (!comparisonPair) return
    setSavingDecision(decision)
    setError('')

    try {
      await readJson(await fetch('/api/individuals/review', {
        body: JSON.stringify({
          candidateDetectionId: comparisonPair.candidate.representativeDetectionId,
          decision,
          referenceDetectionId: comparisonPair.reference.representativeDetectionId
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      }))
      setComparisonPair(null)
      setComparisonInsight(null)
      setDetailRefreshKey((current) => current + 1)
    } catch (decisionError: unknown) {
      setError(decisionError instanceof Error ? decisionError.message : 'No se pudo guardar la decision')
    } finally {
      setSavingDecision('')
    }
  }

  const maxRangeCount = useMemo(() => Math.max(1, ...(detail?.rangeActivity.map((item) => item.count) ?? [0])), [detail])
  const maxDailyCount = useMemo(() => Math.max(1, ...(detail?.dailyActivity.map((item) => item.count) ?? [0])), [detail])

  if (isDetailMode) {
    return (
      <section className="speciesAnalysisPanel speciesDetailFullPage" aria-label="Detalle de especie">
        <button className="secondaryButton speciesBackButton" onClick={returnToList} type="button">
          <ArrowLeft size={16} />
          Volver al analisis de especies
        </button>

        {error ? <div className="statusBanner">{error}</div> : null}
        {limitation ? <div className="speciesLimitation compactLimitation">{limitation}</div> : null}

        {detail ? (
          <>
            <div className="speciesFullHeader">
              <div className="speciesFullIdentity">
                {detail.detections[0]?.imagePath ? (
                  <img alt={detail.species.name} className="speciesRepresentativeThumb" src={detail.detections[0].imagePath} />
                ) : (
                  <span className="speciesRepresentativeFallback"><PawPrint size={24} /></span>
                )}
                <div>
                  <span>{detail.species.taxonomicGroup}</span>
                  <h2>{detail.species.name}</h2>
                  <p>{detail.species.rawSpecies}</p>
                </div>
              </div>
              <div className="speciesFullMeta">
                <strong>{detail.species.taxonomicGroup} | {detail.species.records.toLocaleString('es-ES')} registros | Confianza promedio {formatConfidence(detail.species.averageConfidence)}</strong>
                <span>{detail.camera.code} | {detail.camera.zone}</span>
              </div>
            </div>

            <div className="speciesFullMetrics">
              <article><span>Registros</span><strong>{detail.species.records.toLocaleString('es-ES')}</strong><small>{detail.species.recordsWithCaptureDate.toLocaleString('es-ES')} con fecha de captura</small></article>
              <article><span>Confianza promedio</span><strong>{formatConfidence(detail.species.averageConfidence)}</strong></article>
              <article><span>Primera captura</span><strong>{formatDate(detail.species.firstDetectedAt)}</strong></article>
              <article><span>Ultima captura</span><strong>{formatDate(detail.species.lastDetectedAt)}</strong></article>
              <article><span>Horario de captura</span><strong>{detail.species.peakActivityRange}</strong></article>
              <article><span>Revisiones pendientes</span><strong>{detail.species.pendingReviews.toLocaleString('es-ES')}</strong></article>
            </div>

            <section className="speciesIndividualsPanel">
              <div className="speciesEvidenceHeader">
                <strong><Users size={17} /> Individuos supuestos</strong>
                <span>{detail.individuals.length} grupo{detail.individuals.length === 1 ? '' : 's'}</span>
              </div>
              {comparisonPair ? (
                <div className="individualComparePanel">
                  <div className="individualCompareImages">
                    <article>
                      <img alt={comparisonPair.reference.label} src={comparisonPair.reference.representativeImagePath} />
                      <strong>{comparisonPair.reference.label}</strong>
                      <span>{comparisonPair.reference.detectionCount} registro{comparisonPair.reference.detectionCount === 1 ? '' : 's'}</span>
                    </article>
                    <article>
                      <img alt={comparisonPair.candidate.label} src={comparisonPair.candidate.representativeImagePath} />
                      <strong>{comparisonPair.candidate.label}</strong>
                      <span>{comparisonPair.candidate.detectionCount} registro{comparisonPair.candidate.detectionCount === 1 ? '' : 's'}</span>
                    </article>
                  </div>
                  <div className="individualCompareInsight">
                    <span>Visual: {isComparisonLoading ? 'calculando...' : comparisonInsight?.visualSimilarity !== null && comparisonInsight?.visualSimilarity !== undefined ? `${comparisonInsight.visualSimilarity}%` : 'sin recorte'}</span>
                    <span>Tiempo: {comparisonInsight ? `${comparisonInsight.timeGapHours} h` : '...'}</span>
                    <span>{comparisonInsight?.sameCamera ? 'Misma camara' : 'Camaras distintas'}</span>
                  </div>
                  <div className="individualCompareActions">
                    <button className="primaryButton" disabled={Boolean(savingDecision)} onClick={() => decideComparison('same')} type="button"><CheckCircle2 size={16} /> {savingDecision === 'same' ? 'Guardando...' : 'Mismo individuo'}</button>
                    <button className="secondaryButton" disabled={Boolean(savingDecision)} onClick={() => decideComparison('different')} type="button"><XCircle size={16} /> Distinto</button>
                    <button className="secondaryButton" disabled={Boolean(savingDecision)} onClick={() => decideComparison('unsure')} type="button"><HelpCircle size={16} /> Inseguro</button>
                    <button className="ghostTableAction" disabled={Boolean(savingDecision)} onClick={() => { setComparisonPair(null); setComparisonInsight(null) }} type="button">Cancelar</button>
                  </div>
                </div>
              ) : null}
              <div className="speciesIndividualsGrid">
                {detail.individuals.map((individual) => (
                  <article key={`${individual.id ?? 'none'}-${individual.representativeDetectionId}`}>
                    <img alt={individual.label} src={individual.representativeImagePath} />
                    <div>
                      {individual.id ? (
                        <label>
                          <span>Nombre</span>
                          <input
                            onChange={(event) => setIndividualNames((current) => ({ ...current, [individual.id as number]: event.target.value }))}
                            value={individualNames[individual.id] ?? individual.label}
                          />
                        </label>
                      ) : (
                        <strong>{individual.label}</strong>
                      )}
                      <small>{individual.detectionCount} registro{individual.detectionCount === 1 ? '' : 's'} | {individual.matchStatus}</small>
                      <small>{formatDate(individual.firstDetectedAt)} - {formatDate(individual.lastDetectedAt)}</small>
                      <div className="individualCardActions">
                        {individual.id ? <button className="secondaryButton" disabled={savingIndividualId === individual.id} onClick={() => renameIndividual(individual)} type="button"><Pencil size={15} /> {savingIndividualId === individual.id ? 'Guardando...' : 'Guardar nombre'}</button> : null}
                        <button className="secondaryButton" onClick={() => startComparison(individual)} type="button"><Eye size={15} /> Comparar</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <div className="speciesChartsGrid">
              <section className="speciesChartCard">
                <div className="speciesChartHeader"><BarChart3 size={17} /><strong>Actividad por hora</strong></div>
                <div className="rangeBars fullRangeBars">
                  {detail.rangeActivity.map((item) => <div key={item.range} title={`${item.range}: ${item.count}`}><span>{item.range}</span><div><i style={{ width: `${(item.count / maxRangeCount) * 100}%` }} /></div><strong>{item.count}</strong></div>)}
                </div>
              </section>

              <section className="speciesChartCard">
                <div className="speciesChartHeader"><BarChart3 size={17} /><strong>Registros por fecha</strong></div>
                <div className="dailyBars fullDailyBars">
                  {detail.dailyActivity.length > 0 ? detail.dailyActivity.slice(-18).map((item) => <div key={item.date} title={`${item.date}: ${item.count}`}><i style={{ height: `${Math.max(8, (item.count / maxDailyCount) * 100)}%` }} /><span>{new Date(item.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}</span></div>) : <span className="emptyChartText">Sin registros temporales</span>}
                </div>
              </section>
            </div>

            <p className="speciesActivityConclusion">{detail.activityConclusion}</p>

            <section className="speciesEvidenceFullPanel">
              <div className="speciesEvidenceHeader"><strong>Evidencias fotograficas</strong><span>{isDetailLoading ? 'Cargando...' : `${detail.pagination.total} registros`}</span></div>
              <div className="speciesEvidenceFullGrid">
                {detail.detections.map((detection) => <article key={detection.id}><img alt={getFilename(detection.imagePath)} src={detection.imagePath} /><div><strong>{detection.capturedAt ? formatDate(detection.capturedAt) : 'Sin fecha de captura'}</strong><span>Confianza {formatConfidence(detection.confidence)}</span><small>Procesamiento: {formatDate(detection.createdAt)}</small><small>{detection.priority} | {detection.manualReviewedAt ? 'Revisada' : 'Pendiente'}</small>{onOpenDetection ? <button className="secondaryButton evidenceImageButton" onClick={() => onOpenDetection(detection)} type="button"><Eye size={15} /> Ver imagen</button> : null}</div></article>)}
              </div>
              <div className="paginationBar compactEvidencePagination">
                <button className="secondaryButton" disabled={detail.pagination.page <= 1} onClick={() => setDetailPage((current) => current - 1)} type="button">Anterior</button>
                <span>{detail.pagination.page} / {detail.pagination.totalPages}</span>
                <button className="secondaryButton" disabled={detail.pagination.page >= detail.pagination.totalPages} onClick={() => setDetailPage((current) => current + 1)} type="button">Siguiente</button>
              </div>
            </section>
          </>
        ) : (
          <div className="emptyState">{isDetailLoading ? 'Cargando detalle de especie...' : 'Selecciona una especie para ver su analisis.'}</div>
        )}
      </section>
    )
  }

  return (
    <section className="speciesAnalysisPanel" aria-label="Analisis de especies">
      <div className="speciesAnalysisHeader">
        <div>
          <span>Especies</span>
          <h2>Analisis de especies</h2>
          <p>Consulta la frecuencia, clasificacion y actividad temporal de las especies registradas por esta camara.</p>
        </div>
        {camera ? <div className="speciesHeaderCamera"><Camera size={17} /> {camera.code} | {camera.zone}</div> : null}
      </div>

      {limitation ? <div className="speciesLimitation">{limitation}</div> : null}
      {error ? <div className="statusBanner">{error}</div> : null}

      <div className="speciesAnalysisMetrics">
        <article><span>Especies registradas</span><strong>{metrics?.totalSpecies ?? 0}</strong></article>
        <article><span>Registros con fauna</span><strong>{metrics?.totalFaunaRecords ?? 0}</strong></article>
        <article><span>Grupo predominante</span><strong>{metrics?.predominantGroup ?? 'Sin datos'}</strong></article>
        <article><span>Franja de captura</span><strong>{metrics?.peakActivityRange ?? 'Sin datos'}</strong></article>
      </div>

      <div className="speciesAnalysisControls">
        <label className="quickSearchBox speciesSearchBox">
          <Search size={17} />
          <input aria-label="Buscar especie" onChange={(event) => { setQuery(event.target.value); updatePage(1) }} placeholder="Buscar especie" value={query} />
        </label>
        <select aria-label="Ordenar especies" onChange={(event) => { setSort(event.target.value as SortMode); updatePage(1) }} value={sort}>
          <option value="records">Mas registros</option>
          <option value="recent">Mas reciente</option>
          <option value="confidence">Mayor confianza</option>
          <option value="alphabetical">Orden alfabetico</option>
        </select>
        <button className="secondaryButton" onClick={() => setShowFilters((current) => !current)} type="button"><SlidersHorizontal size={16} /> Filtros</button>
      </div>

      {showFilters ? (
        <div className="speciesAdvancedFilters">
          <label><span>Grupo taxonomico</span><select onChange={(event) => { setGroup(event.target.value); updatePage(1) }} value={group}><option value="">Todos</option>{groups.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>Desde</span><input onChange={(event) => { setFrom(event.target.value); updatePage(1) }} type="date" value={from} /></label>
          <label><span>Hasta</span><input onChange={(event) => { setTo(event.target.value); updatePage(1) }} type="date" value={to} /></label>
          <label><span>Tamano de pagina</span><select onChange={(event) => setPagination((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))} value={pagination.pageSize}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label>
        </div>
      ) : null}

      <div className="speciesTablePanel speciesTableFullPanel">
        <div className="speciesTableHeader"><strong>Especies registradas</strong><span>{isLoading ? 'Cargando...' : `${pagination.total} especies`}</span></div>
        <div className="speciesCompactTable">
          <table>
            <thead><tr><th>Miniatura</th><th>Especie</th><th>Grupo</th><th>Registros</th><th>Confianza</th><th>Primera captura</th><th>Ultima captura</th><th>Franja</th><th></th></tr></thead>
            <tbody>
              {rows.length > 0 ? rows.map((row) => (
                <tr key={row.rawSpecies}>
                  <td>{row.thumbnail ? <img alt={row.species} className="speciesMiniThumb" src={row.thumbnail} /> : <span className="speciesMiniFallback"><PawPrint size={17} /></span>}</td>
                  <td><strong>{row.species}</strong><small>{row.rawSpecies}</small></td>
                  <td>{row.taxonomicGroup}</td>
                  <td>{row.records.toLocaleString('es-ES')}</td>
                  <td>{formatConfidence(row.averageConfidence)}</td>
                  <td>{formatDate(row.firstDetectedAt)}</td>
                  <td>{formatDate(row.lastDetectedAt)}</td>
                  <td>{row.peakActivityRange}</td>
                  <td><button className="ghostTableAction" onClick={() => selectSpecies(row)} type="button">Ver detalle</button></td>
                </tr>
              )) : <tr><td className="emptyState" colSpan={9}>{isLoading ? 'Cargando especies...' : text.emptySpecies}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="paginationBar">
          <button className="secondaryButton" disabled={pagination.page <= 1} onClick={() => updatePage(pagination.page - 1)} type="button"><ChevronLeft size={16} /> Anterior</button>
          <span>Pagina {pagination.page} de {pagination.totalPages}</span>
          <button className="secondaryButton" disabled={pagination.page >= pagination.totalPages} onClick={() => updatePage(pagination.page + 1)} type="button">Siguiente <ChevronRight size={16} /></button>
        </div>
      </div>
    </section>
  )
}
