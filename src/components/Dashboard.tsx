'use client'

import { useEffect, useMemo, useState } from 'react'
import DetectionResult from './DetectionResult'
import Header from './Header'
import RecentDetections from './RecentDetections'
import Sidebar from './Sidebar'
import SpeciesGallery from './SpeciesGallery'
import StatsCards from './StatsCards'
import UploadImage from './UploadImage'
import type { DashboardMetric, DashboardView, DetectionResultData, Priority, RecentDetection } from './dashboardTypes'

type DashboardData = {
  metrics: DashboardMetric[]
  detections: RecentDetection[]
}

type BackendAnalyzeResponse = Partial<DetectionResultData> & {
  error?: string
  warning?: string
}

type DashboardProps = {
  userName: string
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }

  const text = await response.text()
  const message = text.includes('<!DOCTYPE')
    ? 'El servidor devolvio una pagina HTML en lugar de JSON. Revisa que el endpoint /api/analyze este activo.'
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

function normalizeResult(result: BackendAnalyzeResponse): DetectionResultData {
  const species = result.species ?? null
  const confidence = toPercent(Number(result.confidence ?? 0))
  const hasBackendMessage = typeof result.message === 'string' && result.message.trim().length > 0

  return {
    species,
    confidence,
    priority: normalizePriority(result.priority, species, confidence),
    coordinates: result.coordinates,
    message:
      (hasBackendMessage ? result.message : undefined) ??
      result.error ??
      (species === 'Sin deteccion' || !species ? 'No se detecto ningun animal en la imagen.' : undefined),
    imagePath: result.imagePath,
    location: result.location,
    createdAt: result.createdAt
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

async function analyzeImage(file: File): Promise<DetectionResultData> {
  const formData = new FormData()
  formData.append('image', file)
  formData.append('location', 'Camara 01 | Zona Norte')

  const response = await fetch('/api/analyze', {
    body: formData,
    method: 'POST'
  })

  const data = await readJsonResponse<BackendAnalyzeResponse>(response)
  console.log('Respuesta backend:', data)

  if (!response.ok && !data.species) {
    throw new Error(data.error ?? 'No se pudo analizar la imagen')
  }

  return normalizeResult(data)
}

async function loadDetections(): Promise<DashboardData> {
  const response = await fetch('/api/detections', { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('No se pudieron cargar las detecciones')
  }

  const data = await readJsonResponse<DashboardData>(response)

  return {
    metrics: data.metrics,
    detections: data.detections.map(normalizeDetection)
  }
}

export default function Dashboard({ userName }: DashboardProps) {
  const [activeView, setActiveView] = useState<DashboardView>('dashboard')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [result, setResult] = useState<DetectionResultData | null>(null)
  const [detections, setDetections] = useState<RecentDetection[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDetections()
      .then((data) => setDetections(data.detections))
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando detecciones')
      })
  }, [])

  const metrics = useMemo<DashboardMetric[]>(() => {
    const analyzed = detections.length
    const detectedSpecies = new Set(
      detections
        .map((detection) => detection.species)
        .filter((species) => species && species !== 'Sin deteccion')
    ).size
    const averageConfidence =
      analyzed > 0 ? Math.round(detections.reduce((total, detection) => total + detection.confidence, 0) / analyzed) : 0

    return [
      {
        label: 'Imagenes analizadas',
        value: analyzed.toString(),
        detail: 'Total procesado en esta sesion'
      },
      {
        label: 'Especies detectadas',
        value: detectedSpecies.toString(),
        detail: 'Conteo de especies distintas'
      },
      {
        label: 'Confianza promedio',
        value: `${averageConfidence}%`,
        detail: 'Promedio temporal del modelo'
      }
    ]
  }, [detections])

  function handleFileSelected(file: File) {
    setSelectedFile(file)
    setImagePreview(URL.createObjectURL(file))
    setResult(null)
    setError('')
  }

  async function handleAnalyze() {
    if (!selectedFile || !imagePreview) {
      return
    }

    setIsAnalyzing(true)
    setError('')

    try {
      const prediction = await analyzeImage(selectedFile)
      setResult(prediction)

      const nextData = await loadDetections()
      setDetections(nextData.detections)
    } catch (analysisError: unknown) {
      setError(analysisError instanceof Error ? analysisError.message : 'Error analizando la imagen')
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <main className="dashboardShell">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <section className="dashboardMain">
        <Header userName={userName} />

        <div className="contentArea">
          {error ? <div className="statusBanner">{error}</div> : null}

          {activeView === 'species' ? (
            <SpeciesGallery detections={detections} />
          ) : (
            <>
              <StatsCards metrics={metrics} />

              <section className="analysisGrid">
                <UploadImage
                  fileName={selectedFile?.name ?? ''}
                  imagePreview={imagePreview}
                  isAnalyzing={isAnalyzing}
                  onAnalyze={handleAnalyze}
                  onFileSelected={handleFileSelected}
                />
                <DetectionResult result={result} />
              </section>

              <RecentDetections detections={detections} />
            </>
          )}
        </div>
      </section>
    </main>
  )
}
