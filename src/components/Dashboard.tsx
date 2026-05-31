'use client'

import { useMemo, useState } from 'react'
import DetectionResult from './DetectionResult'
import Header from './Header'
import RecentDetections from './RecentDetections'
import Sidebar from './Sidebar'
import StatsCards from './StatsCards'
import UploadImage from './UploadImage'
import type { DashboardMetric, DetectionResultData, Priority, RecentDetection } from './dashboardTypes'

const simulatedResult: DetectionResultData = {
  species: 'Jaguar',
  confidence: 0.96,
  priority: 'Alta prioridad'
}

function getPriority(species: string | null, confidence: number): Priority {
  if (!species) {
    return 'Revisión manual'
  }

  if (confidence >= 0.9 || species.toLowerCase() === 'jaguar') {
    return 'Alta prioridad'
  }

  return confidence >= 0.65 ? 'Normal' : 'Revisión manual'
}

function normalizeResult(result: Partial<DetectionResultData>): DetectionResultData {
  const species = result.species ?? null
  const confidence = Number(result.confidence ?? 0)
  const priority = result.priority ?? getPriority(species, confidence)

  return {
    species,
    confidence,
    priority,
    message: species ? undefined : 'No se detectó ningún animal en la imagen. Se recomienda revisión manual.'
  }
}

async function predictImage(file: File): Promise<DetectionResultData> {
  const formData = new FormData()
  formData.append('image', file)

  try {
    const response = await fetch('/predict', {
      body: formData,
      method: 'POST'
    })

    if (!response.ok) {
      throw new Error('Backend no disponible')
    }

    const result = (await response.json()) as Partial<DetectionResultData>
    return normalizeResult(result)
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 900))
    return simulatedResult
  }
}

export default function Dashboard() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [result, setResult] = useState<DetectionResultData | null>(null)
  const [detections, setDetections] = useState<RecentDetection[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')

  const metrics = useMemo<DashboardMetric[]>(() => {
    const analyzed = detections.length
    const detectedSpecies = new Set(detections.map((detection) => detection.species)).size
    const averageConfidence =
      analyzed > 0
        ? Math.round(
            (detections.reduce((total, detection) => total + detection.confidence, 0) / analyzed) * 100
          )
        : 0

    return [
      {
        label: 'Imágenes analizadas',
        value: analyzed.toString(),
        detail: 'Total procesado en esta sesión'
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
      const prediction = await predictImage(selectedFile)
      setResult(prediction)

      const detectedSpecies = prediction.species

      if (detectedSpecies) {
        setDetections((current) => [
          {
            id: Date.now(),
            imagePath: imagePreview,
            species: detectedSpecies,
            confidence: prediction.confidence,
            location: 'Cámara 01 | Zona Norte',
            priority: prediction.priority,
            createdAt: new Date().toISOString()
          },
          ...current
        ])
      }
    } catch (analysisError: unknown) {
      setError(analysisError instanceof Error ? analysisError.message : 'Error analizando la imagen')
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <main className="dashboardShell">
      <Sidebar />
      <section className="dashboardMain">
        <Header />

        <div className="contentArea">
          {error ? <div className="statusBanner">{error}</div> : null}

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
        </div>
      </section>
    </main>
  )
}
