'use client'

import { useEffect, useMemo, useState } from 'react'
import DetectionResult from './DetectionResult'
import Header from './Header'
import RecentDetections from './RecentDetections'
import Sidebar from './Sidebar'
import SpeciesGallery from './SpeciesGallery'
import StatsCards from './StatsCards'
import UploadImage from './UploadImage'
import { getSpeciesLabel, uiText } from '@/lib/i18n'
import type { DashboardMetric, DashboardView, DetectionResultData, Language, Priority, RecentDetection } from './dashboardTypes'

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

async function analyzeImage(file: File, language: Language): Promise<DetectionResultData> {
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

  return normalizeResult(data, language)
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
    loadDetections()
      .then((data) => setDetections(data.detections))
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando detecciones')
      })
  }, [])

  const metrics = useMemo<DashboardMetric[]>(() => {
    const analyzed = detections.length
    const totalDetections = detections.filter(
      (detection) => detection.species !== 'Sin deteccion' && detection.confidence > 0
    ).length
    const detectedSpecies = new Set(
      detections
        .map((detection) => detection.species)
        .filter((species) => species && species !== 'Sin deteccion')
    ).size
    const averageConfidence =
      analyzed > 0 ? Math.round(detections.reduce((total, detection) => total + detection.confidence, 0) / analyzed) : 0

    return [
      {
        label: text.analyzedImages,
        value: analyzed.toString(),
        detail: text.totalProcessedSession
      },
      {
        label: language === 'es' ? 'Total de detecciones' : 'Total detections',
        value: totalDetections.toString(),
        detail: language === 'es' ? 'Imagenes con animal detectado' : 'Images with animal detected'
      },
      {
        label: text.detectedSpecies,
        value: detectedSpecies.toString(),
        detail: text.countDistinctSpecies
      },
      {
        label: text.averageConfidence,
        value: `${averageConfidence}%`,
        detail: language === 'es' ? 'Promedio temporal del modelo' : 'Temporary model average'
      }
    ]
  }, [detections, language, text])

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
      const prediction = await analyzeImage(selectedFile, language)
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
      <Sidebar activeView={activeView} onViewChange={setActiveView} text={text} />
      <section className="dashboardMain">
        <Header language={language} onLanguageChange={handleLanguageChange} text={text} userName={userName} />

        <div className="contentArea">
          {error ? <div className="statusBanner">{error}</div> : null}

          {activeView === 'species' ? (
            <SpeciesGallery detections={detections} language={language} text={text} />
          ) : (
            <>
              <StatsCards metrics={metrics} text={text} />

              <section className="analysisGrid">
                <UploadImage
                  fileName={selectedFile?.name ?? ''}
                  imagePreview={imagePreview}
                  isAnalyzing={isAnalyzing}
                  text={text}
                  onAnalyze={handleAnalyze}
                  onFileSelected={handleFileSelected}
                />
                <DetectionResult language={language} result={result} text={text} />
              </section>

              <RecentDetections detections={detections} language={language} text={text} />
            </>
          )}
        </div>
      </section>
    </main>
  )
}
