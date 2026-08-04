'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, DatabaseZap, Download, Loader2, Play, RefreshCw, TriangleAlert } from 'lucide-react'

type TrainingDatasetResponse = {
  latestSamples: Array<{
    camera: { code: string; name: string; zone: string } | null
    capturedAt: string | null
    createdAt: string
    detectionId: number
    id: number
    label: string
    reviewedBy: string | null
    taxonomicGroup: string
  }>
  metrics: {
    almostReadySpecies: number
    readySpecies: number
    totalSamples: number
    totalSpecies: number
    trainableSpecies: number
  }
  species: Array<{
    firstReviewedAt: string | null
    latestReviewedAt: string | null
    minImagesForTraining: number
    missingForTraining: number
    readyForTraining: boolean
    sampleCount: number
    scientificName: string
    speciesId: number
    taxonomicGroup: string
  }>
  taxonomicGroups: Record<string, number>
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok) throw new Error(data?.error ?? 'No se pudo completar la accion')
  if (!data) throw new Error('Respuesta invalida del servidor')
  return data
}

function formatNumber(value: number) {
  return value.toLocaleString('es-ES')
}

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function TrainingDatasetPanel() {
  const [data, setData] = useState<TrainingDatasetResponse | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isPreparing, setIsPreparing] = useState(false)
  const [minPerSpecies, setMinPerSpecies] = useState(2)
  const [prepareMessage, setPrepareMessage] = useState('')

  const groupRows = useMemo(() => {
    return Object.entries(data?.taxonomicGroups ?? {}).sort((left, right) => right[1] - left[1])
  }, [data])

  async function loadSummary() {
    setIsLoading(true)
    setError('')
    try {
      const nextData = await readJson<TrainingDatasetResponse>(await fetch('/api/datasets/training', { cache: 'no-store' }))
      setData(nextData)
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el dataset')
    } finally {
      setIsLoading(false)
    }
  }

  async function prepareDataset() {
    setIsPreparing(true)
    setPrepareMessage('')
    setError('')

    try {
      const response = await fetch('/api/datasets/training', {
        body: JSON.stringify({ minPerSpecies }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      })
      const payload = await readJson<{ ok: boolean; result: { message?: string; prepared?: number; skipped?: number; splitCounts?: Record<string, number> } }>(response)
      const result = payload.result
      setPrepareMessage(
        result.prepared
          ? `Dataset preparado: ${formatNumber(result.prepared)} muestras listas.`
          : result.message ?? 'No se pudo preparar ninguna muestra.'
      )
      await loadSummary()
    } catch (prepareError: unknown) {
      setError(prepareError instanceof Error ? prepareError.message : 'No se pudo preparar el dataset')
    } finally {
      setIsPreparing(false)
    }
  }

  useEffect(() => {
    loadSummary()
  }, [])

  return (
    <section className="trainingDataset">
      <div className="datasetToolbar">
        <div>
          <span>Base curada</span>
          <h2>Dataset de entrenamiento</h2>
        </div>
        <div className="datasetActions">
          <button className="secondaryButton" disabled={isLoading || isPreparing} onClick={loadSummary} type="button">
            <RefreshCw size={16} />Actualizar
          </button>
          <a className="secondaryButton" href="/api/datasets/curated">
            <Download size={16} />CSV
          </a>
          <label className="datasetStepper">
            <span>Min.</span>
            <input min="2" max="200" step="1" type="number" value={minPerSpecies} onChange={(event) => setMinPerSpecies(Math.max(2, Number(event.target.value) || 2))} />
          </label>
          <button className="primaryButton" disabled={isPreparing} onClick={prepareDataset} type="button">
            {isPreparing ? <Loader2 className="spinIcon" size={16} /> : <Play size={16} />}Preparar
          </button>
        </div>
      </div>

      {error ? <div className="statusBanner">{error}</div> : null}
      {prepareMessage ? <div className="datasetNotice"><CheckCircle2 size={18} />{prepareMessage}</div> : null}

      <div className="datasetMetrics">
        <article><DatabaseZap size={18} /><span>Muestras curadas</span><strong>{formatNumber(data?.metrics.totalSamples ?? 0)}</strong></article>
        <article><CheckCircle2 size={18} /><span>Especies listas</span><strong>{formatNumber(data?.metrics.readySpecies ?? 0)}</strong></article>
        <article><TriangleAlert size={18} /><span>En progreso</span><strong>{formatNumber(data?.metrics.almostReadySpecies ?? 0)}</strong></article>
        <article><DatabaseZap size={18} /><span>Catalogo</span><strong>{formatNumber(data?.metrics.totalSpecies ?? 0)}</strong></article>
      </div>

      <div className="datasetGrid">
        <section className="datasetPanel">
          <div className="datasetPanelHeader">
            <h3>Especies con muestras</h3>
            <span>{isLoading ? 'Cargando...' : `${data?.species.length ?? 0} visibles`}</span>
          </div>
          <div className="scientificTableWrap">
            <table className="scientificReportTable">
              <thead>
                <tr>
                  <th>Especie</th>
                  <th>Grupo</th>
                  <th>Muestras</th>
                  <th>Faltan</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data?.species.length ? data.species.map((row) => (
                  <tr key={row.speciesId}>
                    <td><strong>{row.scientificName}</strong><small>Ultima: {formatDate(row.latestReviewedAt)}</small></td>
                    <td>{row.taxonomicGroup}</td>
                    <td>{formatNumber(row.sampleCount)}</td>
                    <td>{formatNumber(row.missingForTraining)}</td>
                    <td><span className={row.readyForTraining ? 'datasetStatus ready' : 'datasetStatus pending'}>{row.readyForTraining ? 'Lista' : 'Recolectando'}</span></td>
                  </tr>
                )) : (
                  <tr><td colSpan={5}>{isLoading ? 'Cargando muestras...' : 'Aun no hay muestras curadas. Revisa detecciones para empezar.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="datasetPanel datasetSide">
          <div className="datasetPanelHeader">
            <h3>Distribucion</h3>
          </div>
          <div className="datasetGroupList">
            {groupRows.length ? groupRows.map(([group, count]) => (
              <div key={group}>
                <span>{group}</span>
                <strong>{formatNumber(count)}</strong>
              </div>
            )) : <p>Sin muestras por grupo.</p>}
          </div>
          <div className="datasetPanelHeader compact">
            <h3>Ultimas muestras</h3>
          </div>
          <div className="datasetSampleList">
            {data?.latestSamples.length ? data.latestSamples.map((sample) => (
              <a href={`/historial?species=${encodeURIComponent(sample.label)}`} key={sample.id}>
                <strong>{sample.label}</strong>
                <span>{sample.camera ? `${sample.camera.code} · ${sample.camera.zone}` : 'Sin camara'} · {formatDate(sample.createdAt)}</span>
              </a>
            )) : <p>Sin muestras recientes.</p>}
          </div>
        </aside>
      </div>
    </section>
  )
}
