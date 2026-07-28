'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import BatchDetectionsTable, { type BatchDetectionFilters } from './BatchDetectionsTable'
import BatchHistory from './BatchHistory'
import BatchProgress from './BatchProgress'
import BatchSummary, { type BatchSummaryData } from './BatchSummary'
import BatchUploadPanel from './BatchUploadPanel'
import DetectionDetailModal from './DetectionDetailModal'
import Header, { type HeaderNotification } from './Header'
import IndividualAnalysisPanel from './IndividualAnalysisPanel'
import ManualReviewsPanel from './ManualReviewsPanel'
import Sidebar from './Sidebar'
import SpeciesDistribution from './SpeciesDistribution'
import SpeciesGallery from './SpeciesGallery'
import StatsCards from './StatsCards'
import UploadTabs, { type UploadTab } from './UploadTabs'
import { getSpeciesLabel, uiText } from '@/lib/i18n'
import { isPendingManualReview } from '@/lib/manualReviewPolicy'
import type {
  BatchJob,
  CameraSummary,
  DashboardMetric,
  DashboardView,
  DetectionResultData,
  Language,
  Priority,
  RecentDetection
} from './dashboardTypes'

type DashboardData = {
  metrics: DashboardMetric[]
  detections: RecentDetection[]
  items?: RecentDetection[]
  summary?: { pending: number }
}

type BackendAnalyzeResponse = Partial<DetectionResultData> & {
  error?: string
  warning?: string
}

type BatchesResponse = {
  jobs: BatchJob[]
}

type CameraStatsResponse = {
  completedBatches: number
  totalImages: number
  totalDetections: number
  totalSpecies: number
  imagesWithoutDetection: number
  error?: string
}

type BatchAnalyzeResponse = {
  batchId?: number
  error?: string
  job?: BatchJob
  status?: string
  totalImages?: number
}

type BatchDetailResponse = {
  error?: string
  job?: BatchJob
  progress?: Partial<BatchJob>
  summary?: BatchSummaryData
  detections?: RecentDetection[]
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

const emptyBatchFilters: BatchDetectionFilters = {
  species: '',
  minConfidence: '',
  priority: '',
  review: '',
  detection: ''
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }

  const text = await response.text()
  const message = text.includes('<!DOCTYPE')
    ? 'El servidor devolvio una pagina HTML en lugar de JSON. Revisa que el endpoint solicitado este activo.'
    : text || 'El servidor devolvio una respuesta invalida.'

  throw new Error(message)
}

function toPercent(confidence: number) {
  return confidence <= 1 ? confidence * 100 : confidence
}

function normalizePriority(priority?: string, species?: string | null, confidence = 0): Priority {
  if (priority === 'Alta' || priority === 'Alta prioridad') {
    return 'Alta prioridad'
  }

  if (priority === 'Revision manual' || priority === 'Revisión manual') {
    return 'Revision manual'
  }

  if (!species || species === 'Sin deteccion' || confidence <= 0) {
    return 'Revision manual'
  }

  return 'Normal'
}

function translateBackendMessage(message: string | undefined, language: Language, species?: string | null) {
  if (!message) {
    return undefined
  }

  if (message.includes('no encontro animales')) {
    return uiText[language].noAnimalDetected
  }

  if (message.includes('no asigno una especie concreta')) {
    return language === 'es'
      ? 'SpeciesNet detecto un animal, pero no asigno una especie concreta.'
      : 'SpeciesNet detected an animal, but did not assign a specific species.'
  }

  if (message.includes('clasificador no identifico una especie configurada')) {
    return language === 'es'
      ? 'Se detecto un animal, pero el clasificador no identifico una especie configurada.'
      : 'An animal was detected, but the classifier did not identify a configured species.'
  }

  if (message.includes('SpeciesNet identifico la especie como')) {
    return language === 'es'
      ? `SpeciesNet identifico la especie como ${getSpeciesLabel(species, language)}.`
      : `SpeciesNet identified the species as ${getSpeciesLabel(species, language)}.`
  }

  return message
}

function normalizeResult(result: BackendAnalyzeResponse, language: Language): DetectionResultData {
  const species = result.species ?? null
  const confidence = toPercent(Number(result.confidence ?? 0))
  const hasBackendMessage = typeof result.message === 'string' && result.message.trim().length > 0
  const message = hasBackendMessage ? translateBackendMessage(result.message, language, species) : undefined

  return {
    species,
    confidence,
    priority: normalizePriority(result.priority, species, confidence),
    message: message ?? result.error ?? (species === 'Sin deteccion' || !species ? uiText[language].noAnimalDetected : undefined),
    imagePath: result.imagePath,
    location: result.location,
    createdAt: result.createdAt,
    cameraId: result.cameraId,
    batchJobId: result.batchJobId,
    camera: result.camera,
    cameraTrapCode: result.cameraTrapCode,
    temperatureCelsius: result.temperatureCelsius,
    temperatureFahrenheit: result.temperatureFahrenheit,
    visibleMetadataText: result.visibleMetadataText,
    individualId: result.individualId,
    individualMatchStatus: result.individualMatchStatus,
    individualMatchConfidence: result.individualMatchConfidence,
    individualMatchBasis: result.individualMatchBasis,
    individual: result.individual,
    coordinates: result.coordinates ?? null
  }
}

function normalizeDetection(detection: RecentDetection): RecentDetection {
  const confidence = toPercent(Number(detection.confidence ?? 0))

  return {
    ...detection,
    confidence,
    priority: normalizePriority(detection.priority, detection.species, confidence)
  }
}

function formatNotificationDate(value: string, language: Language) {
  return new Date(value).toLocaleString(language === 'es' ? 'es-ES' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'short'
  })
}

async function analyzeImage(file: File, language: Language, camera: CameraSummary): Promise<DetectionResultData> {
  const formData = new FormData()
  formData.append('image', file)
  formData.append('cameraId', String(camera.id))
  formData.append('location', `${camera.name} | ${camera.zone}`)

  const response = await fetch('/api/analyze', {
    body: formData,
    method: 'POST'
  })

  const data = await readJsonResponse<BackendAnalyzeResponse>(response)

  if (!response.ok && !data.species) {
    throw new Error(data.error ?? 'No se pudo analizar la imagen')
  }

  return normalizeResult(data, language)
}

async function loadDetections(cameraId: number): Promise<DashboardData> {
  const response = await fetch(`/api/detections?cameraId=${cameraId}`, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('No se pudieron cargar las detecciones')
  }

  const data = await readJsonResponse<DashboardData>(response)

  return {
    metrics: data.metrics,
    detections: data.detections.map(normalizeDetection)
  }
}


async function loadPendingReviewDetections(cameraId: number): Promise<RecentDetection[]> {
  const response = await fetch(`/api/detections?cameraId=${cameraId}&review=pending&pageSize=100`, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('No se pudieron cargar las revisiones pendientes')
  }

  const data = await readJsonResponse<DashboardData>(response)
  const items = data.items ?? data.detections ?? []

  return items.map(normalizeDetection)
}

async function loadCameraStats(cameraId: number): Promise<CameraStatsResponse> {
  const response = await fetch(`/api/cameras/${cameraId}/stats`, { cache: 'no-store' })
  const data = await readJsonResponse<CameraStatsResponse>(response)

  if (!response.ok) {
    throw new Error(data.error ?? 'No se pudieron cargar las estadisticas de la camara')
  }

  return data
}

async function loadBatchJobs(cameraId: number): Promise<BatchJob[]> {
  const response = await fetch(`/api/batches?cameraId=${cameraId}`, { cache: 'no-store' })

  if (!response.ok) {
    return []
  }

  const data = await readJsonResponse<BatchesResponse>(response)
  return data.jobs
}

function createPendingBatchFromResponse(file: File, camera: CameraSummary, data: BatchAnalyzeResponse): BatchJob {
  const batchId = Number(data.batchId ?? data.job?.id)

  if (!Number.isInteger(batchId) || batchId <= 0) {
    throw new Error(data.error ?? 'No se recibio el id del lote creado')
  }

  return data.job ?? {
    completedAt: null,
    createdAt: new Date().toISOString(),
    failedImages: 0,
    pendingImages: data.totalImages ?? 0,
    percentage: data.totalImages && data.totalImages > 0 ? 0 : null,
    processedImages: 0,
    status: data.status ?? 'Pendiente',
    totalImages: data.totalImages ?? 0,
    zipName: file.name,
    id: batchId,
    cameraId: camera.id,
    camera: {
      id: camera.id,
      code: camera.code,
      name: camera.name,
      zone: camera.zone
    }
  }
}

async function analyzeBatch(file: File, camera: CameraSummary): Promise<BatchJob> {
  const formData = new FormData()
  formData.append('zip', file)
  formData.append('cameraId', String(camera.id))
  formData.append('location', `${camera.name} | ${camera.zone}`)


  const response = await fetch('/api/batches', {
    body: formData,
    method: 'POST'
  })
  const data = await readJsonResponse<BatchAnalyzeResponse>(response)


  if (!response.ok) {
    throw new Error(data.error ?? 'No se pudo crear el lote')
  }

  const job = createPendingBatchFromResponse(file, camera, data)
  return job
}
function mergeBatchProgress(data: BatchDetailResponse) {
  if (!data.job) {
    return null
  }

  return data.progress ? { ...data.job, ...data.progress } : data.job
}
async function loadBatchDetail(batchId: number, page: number, filters: BatchDetectionFilters): Promise<BatchDetailResponse> {
  const params = new URLSearchParams({ page: String(page), pageSize: '25' })

  if (filters.species) params.set('species', filters.species)
  if (filters.minConfidence) params.set('minConfidence', filters.minConfidence)
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.review) params.set('review', filters.review)
  if (filters.detection) params.set('detection', filters.detection)

  const response = await fetch(`/api/batches/${batchId}?${params.toString()}`, { cache: 'no-store' })
  const data = await readJsonResponse<BatchDetailResponse>(response)

  if (!response.ok) {
    throw new Error(data.error ?? 'No se pudo cargar el lote')
  }

  return {
    ...data,
    detections: data.detections?.map(normalizeDetection) ?? []
  }
}

export default function CameraDetail({ camera }: { camera: CameraSummary }) {
  const [activeView, setActiveView] = useState<DashboardView>('dashboard')
  const [batchFile, setBatchFile] = useState<File | null>(null)
  const [uploadTab, setUploadTab] = useState<UploadTab>('zip')
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([])
  const [cameraStats, setCameraStats] = useState<CameraStatsResponse | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<BatchJob | null>(null)
  const [batchSummary, setBatchSummary] = useState<BatchSummaryData | null>(null)
  const [batchDetections, setBatchDetections] = useState<RecentDetection[]>([])
  const [batchFilters, setBatchFilters] = useState<BatchDetectionFilters>(emptyBatchFilters)
  const [batchPage, setBatchPage] = useState(1)
  const [batchTotalPages, setBatchTotalPages] = useState(1)
  const [selectedDetection, setSelectedDetection] = useState<RecentDetection | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [result, setResult] = useState<DetectionResultData | null>(null)
  const [detections, setDetections] = useState<RecentDetection[]>([])
  const [reviewDetections, setReviewDetections] = useState<RecentDetection[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [error, setError] = useState('')
  const [language, setLanguage] = useState<Language>('es')
  const text = uiText[language]

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem('wildlifeai-language')

    if (savedLanguage === 'es' || savedLanguage === 'en') {
      setLanguage(savedLanguage)
    }
  }, [])

  function handleLanguageChange(nextLanguage: Language) {
    setLanguage(nextLanguage)
    window.localStorage.setItem('wildlifeai-language', nextLanguage)
    setResult((currentResult) =>
      currentResult
        ? {
            ...currentResult,
            message:
              currentResult.species === 'Sin deteccion' || !currentResult.species
                ? uiText[nextLanguage].noAnimalDetected
                : currentResult.message?.includes('SpeciesNet')
                  ? translateBackendMessage(currentResult.message, nextLanguage, currentResult.species)
                  : currentResult.message
          }
        : currentResult
    )
  }

  useEffect(() => {
    loadDetections(camera.id)
      .then((data) => setDetections(data.detections))
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando detecciones')
      })

    loadPendingReviewDetections(camera.id)
      .then(setReviewDetections)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando revisiones pendientes')
      })

    loadCameraStats(camera.id)
      .then((stats) => setCameraStats(stats))
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando estadisticas de la camara')
      })

    loadBatchJobs(camera.id).then((jobs) => {
      setBatchJobs(jobs)
      if (jobs[0]) {
        setSelectedBatch((current) => current ?? jobs[0])
        setSelectedBatchId((currentId) => currentId ?? jobs[0].id)
      }
    })
  }, [camera.id])

  useEffect(() => {
    if (!selectedBatchId) {
      setBatchSummary(null)
      setBatchDetections([])
      setBatchTotalPages(1)
      return
    }

    let isCancelled = false

    loadBatchDetail(selectedBatchId, batchPage, batchFilters)
      .then((data) => {
        if (isCancelled) return
        setBatchSummary(data.summary ?? null)
        setBatchDetections(data.detections ?? [])
        setBatchTotalPages(data.pagination?.totalPages ?? 1)
        const detailedJob = mergeBatchProgress(data)
        if (detailedJob) {
          setSelectedBatch(detailedJob)
          setSelectedBatchId(detailedJob.id)
          setBatchJobs((current) =>
            current.some((job) => job.id === detailedJob.id)
              ? current.map((job) => (job.id === detailedJob.id ? detailedJob : job))
              : [detailedJob, ...current]
          )
        }
      })
      .catch((loadError: unknown) => {
        if (!isCancelled) {
          console.error('Selected batch load error:', loadError)
          setError('No se pudo actualizar temporalmente el progreso.')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [selectedBatchId, batchPage, batchFilters])


  useEffect(() => {
    const isProcessing = isAnalyzing || isBatchProcessing

    if (!isProcessing) {
      return
    }

    setAnalysisProgress(8)
    const intervalId = window.setInterval(() => {
      setAnalysisProgress((currentProgress) => {
        if (currentProgress >= 92) {
          return currentProgress
        }

        const increment = currentProgress < 45 ? 7 : currentProgress < 75 ? 4 : 2
        return Math.min(92, currentProgress + increment)
      })
    }, 700)

    return () => window.clearInterval(intervalId)
  }, [isAnalyzing, isBatchProcessing])

  const metrics = useMemo<DashboardMetric[]>(() => {
    const stats = cameraStats ?? {
      completedBatches: 0,
      totalImages: 0,
      totalDetections: 0,
      totalSpecies: 0,
      imagesWithoutDetection: 0
    }

    return [
      {
        label: 'Lotes procesados',
        value: stats.completedBatches.toLocaleString('es-ES'),
        detail: 'Procesamientos completados para esta camara'
      },
      {
        label: 'Im\u00e1genes analizadas',
        value: stats.totalImages.toLocaleString('es-ES'),
        detail: 'Total hist\u00f3rico de im\u00e1genes analizadas'
      },
      {
        label: 'Detecciones',
        value: stats.totalDetections.toLocaleString('es-ES'),
        detail: 'Detecciones registradas hist\u00f3ricamente'
      },
      {
        label: 'Especies registradas',
        value: stats.totalSpecies.toLocaleString('es-ES'),
        detail: 'Especies diferentes registradas'
      },
      {
        label: 'Im\u00e1genes sin detecci\u00f3n',
        value: stats.imagesWithoutDetection.toLocaleString('es-ES'),
        detail: 'Im\u00e1genes sin presencia de fauna detectada'
      }
    ]
  }, [cameraStats])

  const notifications = useMemo<HeaderNotification[]>(() => {
    const highPriority = detections
      .filter((detection) => detection.priority === 'Alta prioridad')
      .slice(0, 3)
      .map((detection) => ({
        description: `${detection.species} en ${camera.name}`,
        id: `high-${detection.id}`,
        time: formatNotificationDate(detection.createdAt, language),
        title: 'Hallazgo de alta prioridad',
        tone: 'alert' as const
      }))
    const reviewItems = detections
      .filter(isPendingManualReview)
      .slice(0, 3)
      .map((detection) => ({
        description:
          detection.species === 'Sin deteccion'
            ? `Imagen pendiente de revisar en ${camera.name}`
            : `${detection.species} requiere validacion`,
        id: `review-${detection.id}`,
        time: formatNotificationDate(detection.createdAt, language),
        title: 'Revisión manual pendiente',
        tone: 'review' as const
      }))
    const batchItems = batchJobs.slice(0, 3).map((job) => ({
      description: `${job.processedImages}/${job.totalImages} imagenes procesadas${job.failedImages > 0 ? `, ${job.failedImages} con error` : ''}`,
      id: `batch-${job.id}`,
      time: formatNotificationDate(job.completedAt ?? job.createdAt, language),
      title: job.status === 'Fallido' ? 'Lote fallido' : `Lote ${job.status.toLowerCase()}`,
      tone: job.status === 'Fallido' ? ('error' as const) : job.failedImages > 0 ? ('review' as const) : ('success' as const)
    }))

    return [...highPriority, ...reviewItems, ...batchItems].slice(0, 8)
  }, [batchJobs, camera.name, detections, language])

  function handleFileSelected(file: File) {
    setSelectedFile(file)
    setImagePreview(URL.createObjectURL(file))
    setResult(null)
    setError('')
  }

  function handleZipSelected(file: File) {
    setBatchFile(file)
    setResult(null)
    setError('')
  }

  function handleManualReviewCompleted(updatedDetection: RecentDetection) {
    setDetections((currentDetections) =>
      currentDetections.map((detection) => (detection.id === updatedDetection.id ? normalizeDetection(updatedDetection) : detection))
    )
    setReviewDetections((currentDetections) => currentDetections.filter((detection) => detection.id !== updatedDetection.id))
    setBatchDetections((currentDetections) =>
      currentDetections.map((detection) => (detection.id === updatedDetection.id ? normalizeDetection(updatedDetection) : detection))
    )
  }

  async function handleAnalyze() {
    if (!selectedFile || !imagePreview) {
      return
    }

    setIsAnalyzing(true)
    setAnalysisProgress(8)
    setError('')

    try {
      const prediction = await analyzeImage(selectedFile, language, camera)
      setAnalysisProgress(100)
      setResult(prediction)

      const nextData = await loadDetections(camera.id)
      setDetections(nextData.detections)
      setReviewDetections(await loadPendingReviewDetections(camera.id))
    } catch (analysisError: unknown) {
      setError(analysisError instanceof Error ? analysisError.message : 'Error analizando la imagen')
    } finally {
      window.setTimeout(() => {
        setIsAnalyzing(false)
        setAnalysisProgress(0)
      }, 450)
    }
  }

  async function handleBatchAnalyze() {
    if (!batchFile) {
      return
    }

    setIsBatchProcessing(true)
    setError('')

    try {
      const currentBatchFile = batchFile
      const job = await analyzeBatch(currentBatchFile, camera)

      setBatchPage(1)
      setBatchFilters(emptyBatchFilters)
      setBatchSummary(null)
      setBatchDetections([])
      setBatchTotalPages(1)
      setBatchJobs((currentJobs) => [job, ...currentJobs.filter((currentJob) => currentJob.id !== job.id)])
      setSelectedBatchId(job.id)
      setSelectedBatch(job)
      setBatchFile(null)

      const detail = await loadBatchDetail(job.id, 1, emptyBatchFilters)

      const detailedJob = mergeBatchProgress(detail)
      if (detailedJob) {
        setSelectedBatchId(detailedJob.id)
        setSelectedBatch(detailedJob)
        setBatchJobs((currentJobs) =>
          currentJobs.some((currentJob) => currentJob.id === detailedJob.id)
            ? currentJobs.map((currentJob) => (currentJob.id === detailedJob.id ? detailedJob : currentJob))
            : [detailedJob, ...currentJobs]
        )
      }
      setBatchSummary(detail.summary ?? null)
      setBatchDetections(detail.detections ?? [])
      setBatchTotalPages(detail.pagination?.totalPages ?? 1)

      const nextData = await loadDetections(camera.id)
      setDetections(nextData.detections)
    } catch (batchError: unknown) {
      setError(batchError instanceof Error ? batchError.message : 'Error procesando el ZIP')
    } finally {
      setIsBatchProcessing(false)
    }
  }

  function handleSelectBatch(job: BatchJob) {
    setSelectedBatchId(job.id)
    setSelectedBatch(job)
    setBatchPage(1)
    setBatchFilters(emptyBatchFilters)
  }

  function handleFiltersChange(filters: BatchDetectionFilters) {
    setBatchFilters(filters)
    setBatchPage(1)
  }

  const handleBatchDetail = useCallback((data: BatchDetailResponse) => {
    const detailedJob = mergeBatchProgress(data)
    if (detailedJob) {
      setSelectedBatchId(detailedJob.id)
      setSelectedBatch(detailedJob)
      setBatchJobs((currentJobs) =>
        currentJobs.some((job) => job.id === detailedJob.id)
          ? currentJobs.map((job) => (job.id === detailedJob.id ? detailedJob : job))
          : [detailedJob, ...currentJobs]
      )
    }

    if (data.summary) {
      setBatchSummary(data.summary)
    }

    if (data.detections) {
      setBatchDetections(data.detections.map(normalizeDetection))
    }

    if (data.pagination) {
      setBatchTotalPages(data.pagination.totalPages)
    }
  }, [])

  return (
    <main className="dashboardShell">
      <Sidebar activeView={activeView} onViewChange={setActiveView} text={text} />
      <section className="dashboardMain">
        <Header
          language={language}
          notifications={notifications}
          onLanguageChange={handleLanguageChange}
          text={text}
          title={camera.name}
          subtitle={`${camera.code} · ${camera.zone}${
            camera.latitude !== null && camera.latitude !== undefined && camera.longitude !== null && camera.longitude !== undefined
              ? ` · ${camera.latitude.toFixed(5)}, ${camera.longitude.toFixed(5)}`
              : ''
          }`}
        />

        <div className="contentArea cameraBatchWorkspace">
          <div className="cameraDetailActions">
            <Link className="secondaryButton cameraBackButton" href="/cameras">
              <ArrowLeft size={17} />
              Volver al listado de camaras
            </Link>
            <span>{camera.description ?? 'Camara trampa registrada como origen de imagenes.'}</span>
          </div>

          {error ? <div className="statusBanner">{error}</div> : null}

          {activeView === 'species' ? (
            <SpeciesGallery camera={camera} detections={detections} language={language} onOpenDetection={setSelectedDetection} text={text} />
          ) : activeView === 'reviews' ? (
            <ManualReviewsPanel
              detections={reviewDetections}
              language={language}
              onReviewCompleted={handleManualReviewCompleted}
              text={text}
            />
          ) : (
            <>
              <StatsCards metrics={metrics} text={text} />

              <UploadTabs
                activeTab={uploadTab}
                onTabChange={setUploadTab}
                zipContent={(
                  <BatchUploadPanel
                    file={batchFile}
                    isProcessing={isBatchProcessing}
                    lastProcessedAt={batchJobs[0]?.completedAt ?? batchJobs[0]?.createdAt ?? camera.lastUploadAt}
                    onAnalyze={handleBatchAnalyze}
                    onZipSelected={handleZipSelected}
                  />
                )}
                imageContent={(
                <IndividualAnalysisPanel
                  analysisProgress={analysisProgress}
                  fileName={selectedFile?.name ?? ''}
                  imagePreview={imagePreview}
                  isAnalyzing={isAnalyzing}
                  language={language}
                  onAnalyze={handleAnalyze}
                  onFileSelected={handleFileSelected}
                  result={result}
                  text={text}
                />
                )}
              />

              {(selectedBatchId || selectedBatch || isBatchProcessing) ? (
                <BatchProgress
                  batchId={selectedBatchId ?? selectedBatch?.id ?? null}
                  detectionsFound={batchSummary?.animalDetections ?? 0}
                  isProcessing={isBatchProcessing}
                  job={selectedBatch}
                  onBatchDetail={handleBatchDetail}
                  zipName={batchFile?.name}
                />
              ) : null}

              <BatchSummary job={selectedBatch} summary={batchSummary} />
              <SpeciesDistribution distribution={batchSummary?.speciesDistribution ?? []} language={language} />

              <BatchDetectionsTable
                detections={batchDetections}
                filters={batchFilters}
                language={language}
                onFiltersChange={handleFiltersChange}
                onOpenDetection={setSelectedDetection}
                onPageChange={setBatchPage}
                page={batchPage}
                totalPages={batchTotalPages}
              />

              <BatchHistory jobs={batchJobs} onSelect={handleSelectBatch} selectedBatchId={selectedBatchId} />
            </>
          )}
        </div>
      </section>

      <DetectionDetailModal
        batch={selectedBatch}
        camera={camera}
        detection={selectedDetection}
        language={language}
        onClose={() => setSelectedDetection(null)}
      />
    </main>
  )
}




