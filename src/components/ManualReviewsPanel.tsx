'use client'

import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Keyboard,
  ListChecks,
  Maximize2,
  Minus,
  Move,
  Plus,
  Search,
  SkipForward,
  Trash2
} from 'lucide-react'
import { getSpeciesLabel, type Language, type UiText } from '@/lib/i18n'
import { getManualReviewStatus, isPendingManualReview } from '@/lib/manualReviewPolicy'
import { getSpeciesSuggestion, getTaxonomicGroup, normalizeTaxonomyKey, speciesSuggestions, taxonomicGroups, type TaxonomicGroup } from '@/lib/speciesTaxonomy'
import type { RecentDetection } from './dashboardTypes'

async function completeManualReview(detectionId: number, species: string, note: string, reviewVersion: number, manualReviewStatus?: string) {
  const response = await fetch('/api/detections', {
    body: JSON.stringify({ detectionId, note, species, reviewVersion, manualReviewStatus }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH'
  })
  const data = (await response.json().catch(() => null)) as { detection?: RecentDetection; error?: string } | null

  if (!response.ok || !data?.detection) {
    throw new Error(data?.error ?? 'No se pudo completar la revision')
  }

  return data.detection
}

function getFilename(path: string) {
  return decodeURIComponent(path.split('/').pop() ?? path)
}

function formatConfidence(confidence = 0) {
  const percent = confidence <= 1 ? confidence * 100 : confidence
  return `${Math.round(percent)}%`
}

function formatDateTime(value?: string | null, language: Language = 'es') {
  if (!value) return 'Fecha de captura no disponible'
  return new Date(value).toLocaleString(language === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDateOnly(value?: string | null, language: Language = 'es') {
  if (!value) return 'Sin fecha de captura'
  return new Date(value).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTimeOnly(value?: string | null, language: Language = 'es') {
  if (!value) return 'Sin hora'
  return new Date(value).toLocaleTimeString(language === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatCaptureSource(value?: string | null) {
  if (value === 'EXIF_DATE_TIME_ORIGINAL') return 'EXIF DateTimeOriginal'
  if (value === 'EXIF_CREATE_DATE') return 'EXIF CreateDate'
  if (value === 'EXIF_DATE_TIME') return 'EXIF DateTime'
  if (value === 'FILENAME') return 'Nombre del archivo'
  if (value === 'OCR') return 'OCR'
  return 'UNKNOWN'
}

function clampZoom(value: number) {
  return Math.min(5, Math.max(0.5, value))
}

function hasBoundingBox(detection: RecentDetection | null) {
  return Boolean(
    detection &&
      detection.x1 !== null && detection.x1 !== undefined &&
      detection.y1 !== null && detection.y1 !== undefined &&
      detection.x2 !== null && detection.x2 !== undefined &&
      detection.y2 !== null && detection.y2 !== undefined
  )
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable
}

function reviewStateLabel(detection: RecentDetection | null) {
  if (!detection) return 'Pendiente'
  if (!detection.manualReviewedAt) return 'Pendiente'
  const normalized = normalizeTaxonomyKey(detection.species)
  if (normalized === 'sin deteccion') return 'Sin fauna'
  if (normalized === 'imagen no evaluable') return 'No evaluable'
  return detection.priority === 'Revision manual' ? 'Corregida' : 'Confirmada'
}

function buildReviewNote(baseNote: string, marker: string) {
  const trimmed = baseNote.trim()
  return trimmed ? `${marker}: ${trimmed}` : marker
}

type SpeciesOption = {
  label: string
  value: string
  group: TaxonomicGroup
  rawLabel?: string
  commonNameEn?: string
  commonNameEs?: string
  scientificName?: string
}

type ReviewQueueFilter = 'all' | 'broad' | 'lowConfidence' | 'priority'

const broadReviewLabels = new Set([
  'animal',
  'mammal',
  'bird',
  'rodent',
  'reptile',
  'amphibian',
  'fish',
  'insect',
  'leopardus species',
  'didelphis species',
  'possum family',
  'weasel family'
])

const quickSuggestionValues: Record<string, string[]> = {
  'didelphis species': ['Didelphis marsupialis'],
  'leopardus species': ['Leopardus pardalis', 'Leopardus wiedii'],
  mammal: [
    'Leopardus pardalis',
    'Leopardus wiedii',
    'Tapirus terrestris',
    'Tamandua tetradactyla',
    'Didelphis marsupialis',
    'Pecari tajacu',
    'Nasua nasua'
  ],
  'possum family': ['Didelphis marsupialis'],
  rodent: ['Cuniculus paca', 'Dasyprocta punctata', 'Dasyprocta fuliginosa'],
  'weasel family': ['Eira barbara']
}

function isBroadReviewSpecies(species?: string | null) {
  const normalized = normalizeTaxonomyKey(species ?? '')
  return broadReviewLabels.has(normalized) || normalized.endsWith(' family') || normalized.endsWith(' species')
}

function getConfidencePercent(confidence = 0) {
  return confidence <= 1 ? confidence * 100 : confidence
}

function getReviewReasons(detection: RecentDetection) {
  const reasons: string[] = []
  if (isBroadReviewSpecies(detection.species)) reasons.push('Etiqueta amplia')
  if (getConfidencePercent(detection.confidence) <= 70) reasons.push('Baja confianza')
  if (detection.priority === 'Alta prioridad') reasons.push('Alta prioridad')
  if (!hasBoundingBox(detection)) reasons.push('Sin cuadro')
  if (!reasons.length) reasons.push('Validacion requerida')
  return reasons
}

function getReviewScore(detection: RecentDetection) {
  let score = 0
  if (isBroadReviewSpecies(detection.species)) score += 60
  const confidence = getConfidencePercent(detection.confidence)
  if (confidence <= 40) score += 30
  else if (confidence <= 70) score += 18
  if (detection.priority === 'Alta prioridad') score += 20
  if (!hasBoundingBox(detection)) score += 10
  return score
}

function getQuickSuggestions(detection: RecentDetection, options: SpeciesOption[]) {
  const normalized = normalizeTaxonomyKey(detection.species)
  const values = quickSuggestionValues[normalized] ?? []
  const byValue = new Map(options.map((option) => [normalizeTaxonomyKey(option.value), option]))
  return values.map((value) => byValue.get(normalizeTaxonomyKey(value))).filter(Boolean) as SpeciesOption[]
}

function SpeciesAutocomplete({
  group,
  onGroupChange,
  onSpeciesChange,
  options,
  species
}: {
  group: TaxonomicGroup
  onGroupChange: (group: TaxonomicGroup) => void
  onSpeciesChange: (species: string) => void
  options: SpeciesOption[]
  species: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const normalizedQuery = normalizeTaxonomyKey(species)
  const filteredOptions = options
    .filter((option) => {
      if (!normalizedQuery) return true
      return normalizeTaxonomyKey(`${option.label} ${option.value} ${option.rawLabel ?? ''} ${option.commonNameEn ?? ''} ${option.commonNameEs ?? ''} ${option.scientificName ?? ''}`).includes(normalizedQuery)
    })
    .slice(0, 8)

  function choose(value: string, nextGroup: TaxonomicGroup) {
    onSpeciesChange(value)
    onGroupChange(nextGroup)
    setIsOpen(false)
  }

  return (
    <div className="speciesAutocomplete">
      <label className="reviewField compactReviewField">
        <span>Buscar especie</span>
        <div className="speciesSearchInput">
          <Search size={16} />
          <input
            onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
            onChange={(event) => {
              const value = event.target.value
              onSpeciesChange(value)
              onGroupChange(getSpeciesSuggestion(value)?.group ?? getTaxonomicGroup(value))
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Buscar especie..."
            value={species}
          />
        </div>
      </label>

      {isOpen && filteredOptions.length > 0 ? (
        <div className="speciesAutocompleteMenu" role="listbox">
          {filteredOptions.map((option) => (
            <button key={`${option.value}-${option.label}`} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.value, option.group)} type="button">
              <strong>{option.label}</strong>
              <span>{option.group}{option.value !== option.label ? ` | ${option.value}` : ''}</span>
              {option.commonNameEn && option.commonNameEn !== option.label ? <small>{option.commonNameEn}</small> : null}
            </button>
          ))}
        </div>
      ) : null}

      <label className="reviewField compactReviewField">
        <span>Grupo taxonomico</span>
        <select onChange={(event) => onGroupChange(event.target.value as TaxonomicGroup)} value={group}>
          {taxonomicGroups.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    </div>
  )
}

function ManualReviewImageViewer({
  detection,
  language
}: {
  detection: RecentDetection
  language: Language
}) {
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [viewMode, setViewMode] = useState<'original' | 'detection'>('detection')
  const [showBox, setShowBox] = useState(true)
  const [showLabel, setShowLabel] = useState(true)

  const speciesLabel = getSpeciesLabel(detection.species, language)
  const confidenceLabel = formatConfidence(detection.confidence)
  const coordinates = useMemo(() => {
    if (!hasBoundingBox(detection)) return null
    return [detection.x1, detection.y1, detection.x2, detection.y2] as [number, number, number, number]
  }, [detection])
  const box = useMemo(() => {
    if (!coordinates || !imageSize.width || !imageSize.height || viewMode === 'original' || !showBox) return null
    return {
      left: `${(coordinates[0] / imageSize.width) * 100}%`,
      top: `${(coordinates[1] / imageSize.height) * 100}%`,
      width: `${((coordinates[2] - coordinates[0]) / imageSize.width) * 100}%`,
      height: `${((coordinates[3] - coordinates[1]) / imageSize.height) * 100}%`
    }
  }, [coordinates, imageSize.height, imageSize.width, showBox, viewMode])

  useEffect(() => {
    setImageSize({ width: 0, height: 0 })
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setIsDragging(false)
    setViewMode(hasBoundingBox(detection) ? 'detection' : 'original')
    dragStart.current = null
  }, [detection])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        setZoom((current) => clampZoom(current + 0.25))
      } else if (event.key === '-') {
        event.preventDefault()
        setZoom((current) => clampZoom(current - 0.25))
      } else if (event.key === '0') {
        event.preventDefault()
        resetView(1)
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        requestFullscreen()
      } else if (event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setShowBox((current) => !current)
      } else if (event.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function resetView(nextZoom = 1) {
    setZoom(nextZoom)
    setPan({ x: 0, y: 0 })
  }

  function handlePointerDown(event: MouseEvent<HTMLDivElement>) {
    dragStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    setIsDragging(true)
  }

  function handlePointerMove(event: MouseEvent<HTMLDivElement>) {
    if (!dragStart.current) return
    setPan({
      x: dragStart.current.panX + event.clientX - dragStart.current.x,
      y: dragStart.current.panY + event.clientY - dragStart.current.y
    })
  }

  function stopDragging() {
    dragStart.current = null
    setIsDragging(false)
  }

  function requestFullscreen() {
    viewerRef.current?.requestFullscreen?.()
  }

  return (
    <section className="manualReviewViewerPanel">
      <div className="manualReviewToolbar">
        <div className="reviewSegmentControl" role="tablist" aria-label="Comparacion de imagen">
          <button aria-selected={viewMode === 'original'} className={viewMode === 'original' ? 'active' : ''} onClick={() => setViewMode('original')} role="tab" type="button">Original</button>
          <button aria-selected={viewMode === 'detection'} className={viewMode === 'detection' ? 'active' : ''} onClick={() => setViewMode('detection')} role="tab" type="button">Con deteccion</button>
        </div>
        <div className="manualImageTools">
          <button className="iconButton" onClick={() => setZoom((current) => clampZoom(current + 0.25))} title="Zoom +" type="button"><Plus size={17} /></button>
          <button className="iconButton" onClick={() => setZoom((current) => clampZoom(current - 0.25))} title="Zoom -" type="button"><Minus size={17} /></button>
          <button className="secondaryButton compactToolButton" onClick={() => resetView(1)} type="button">100%</button>
          <button className="secondaryButton compactToolButton" onClick={() => resetView(1)} type="button">Ajustar</button>
          <button className="iconButton" onClick={() => setShowBox((current) => !current)} title="Mostrar u ocultar bounding box" type="button">{showBox ? <Eye size={17} /> : <EyeOff size={17} />}</button>
          <button className="iconButton" onClick={() => setShowLabel((current) => !current)} title="Mostrar u ocultar etiqueta" type="button"><BadgeCheck size={17} /></button>
          <button className="iconButton" onClick={requestFullscreen} title="Pantalla completa" type="button"><Maximize2 size={17} /></button>
          <a className="iconButton" download={getFilename(detection.imagePath)} href={detection.imagePath} title="Descargar imagen"><Download size={17} /></a>
        </div>
      </div>

      <div
        className={isDragging ? 'manualReviewImageViewport dragging' : 'manualReviewImageViewport'}
        onMouseDown={handlePointerDown}
        onMouseLeave={stopDragging}
        onMouseMove={handlePointerMove}
        onMouseUp={stopDragging}
        ref={viewerRef}
      >
        <div className="manualReviewImageStage" onDoubleClick={() => setZoom((current) => clampZoom(current + 0.5))} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <img
            alt={`Revision manual: ${speciesLabel}`}
            className="manualReviewMainImage"
            onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            src={detection.imagePath}
          />
          {box ? (
            <div className="manualReviewDetectionBox" style={box}>
              {showLabel ? <div className="manualReviewDetectionLabel"><strong>{speciesLabel}</strong><span>{confidenceLabel}</span></div> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="manualReviewImageFooter">
        <span><Move size={15} /> Arrastra para desplazar</span>
        <strong>{Math.round(zoom * 100)}%</strong>
      </div>
    </section>
  )
}

export default function ManualReviewsPanel({
  detections,
  language,
  onReviewCompleted,
  text
}: {
  detections: RecentDetection[]
  language: Language
  onReviewCompleted: (detection: RecentDetection) => void
  text: UiText
}) {
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [speciesByDetection, setSpeciesByDetection] = useState<Record<number, string>>({})
  const [groupByDetection, setGroupByDetection] = useState<Record<number, TaxonomicGroup>>({})
  const [savingId, setSavingId] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [showQueue, setShowQueue] = useState(false)
  const [queueFilter, setQueueFilter] = useState<ReviewQueueFilter>('all')
  const [, setSkippedIds] = useState<Set<number>>(new Set())

  const pendingReviewItems = useMemo(
    () =>
      detections
        .filter(isPendingManualReview)
        .map((detection) => ({
          detection,
          reasons: getReviewReasons(detection),
          score: getReviewScore(detection)
        }))
        .sort((a, b) => b.score - a.score || new Date(b.detection.createdAt).getTime() - new Date(a.detection.createdAt).getTime()),
    [detections]
  )
  const reviewStats = useMemo(() => ({
    broad: pendingReviewItems.filter((item) => item.reasons.includes('Etiqueta amplia')).length,
    lowConfidence: pendingReviewItems.filter((item) => item.reasons.includes('Baja confianza')).length,
    priority: pendingReviewItems.filter((item) => item.reasons.includes('Alta prioridad')).length,
    total: pendingReviewItems.length
  }), [pendingReviewItems])
  const pendingReviewItemsForFilter = useMemo(() => pendingReviewItems.filter((item) => {
    if (queueFilter === 'broad') return item.reasons.includes('Etiqueta amplia')
    if (queueFilter === 'lowConfidence') return item.reasons.includes('Baja confianza')
    if (queueFilter === 'priority') return item.reasons.includes('Alta prioridad')
    return true
  }), [pendingReviewItems, queueFilter])
  const pendingReviews = useMemo(() => pendingReviewItemsForFilter.map((item) => item.detection), [pendingReviewItemsForFilter])
  const activeReview = pendingReviews[activeIndex] ?? pendingReviews[0] ?? null
  const reviewedCount = Math.max(0, detections.filter((detection) => !isPendingManualReview(detection) && (detection.manualReviewedAt || detection.manualReviewStatus)).length)
  const totalReviewLike = reviewedCount + pendingReviewItems.length
  const progressValue = totalReviewLike > 0 ? Math.round((reviewedCount / totalReviewLike) * 100) : 100

  const autocompleteOptions = useMemo(() => {
    const fromDetections = detections
      .filter((detection) => detection.species && normalizeTaxonomyKey(detection.species) !== 'sin deteccion')
      .map((detection) => ({
        label: getSpeciesLabel(detection.species, language),
        value: detection.species,
        group: getTaxonomicGroup(detection.species),
        rawLabel: detection.species
      }))
    const unique = new Map<string, SpeciesOption>()
    ;[...speciesSuggestions, ...fromDetections].forEach((option) => unique.set(normalizeTaxonomyKey(option.value), option))
    return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label, language === 'es' ? 'es' : 'en'))
  }, [detections, language])
  const activeReviewReasons = activeReview ? getReviewReasons(activeReview) : []
  const activeQuickSuggestions = activeReview ? getQuickSuggestions(activeReview, autocompleteOptions) : []

  const currentSpecies = activeReview
    ? speciesByDetection[activeReview.id] ?? (activeReview.species === 'Sin deteccion' ? '' : activeReview.species)
    : ''
  const currentGroup = activeReview ? groupByDetection[activeReview.id] ?? getTaxonomicGroup(currentSpecies || activeReview.species) : 'Sin clasificar'
  const currentNote = activeReview ? notes[activeReview.id] ?? '' : ''

  useEffect(() => {
    if (activeIndex > Math.max(0, pendingReviews.length - 1)) {
      setActiveIndex(Math.max(0, pendingReviews.length - 1))
    }
  }, [activeIndex, pendingReviews.length])

  useEffect(() => {
    setActiveIndex(0)
  }, [queueFilter])

  useEffect(() => {
    if (queueFilter !== 'all' && pendingReviewItemsForFilter.length === 0) {
      setQueueFilter('all')
    }
  }, [pendingReviewItemsForFilter.length, queueFilter])

  function updateSpecies(detectionId: number, species: string) {
    setSpeciesByDetection((current) => ({ ...current, [detectionId]: species }))
  }

  function updateGroup(detectionId: number, group: TaxonomicGroup) {
    setGroupByDetection((current) => ({ ...current, [detectionId]: group }))
  }

  const goPrevious = useCallback(() => {
    setActiveIndex((current) => Math.max(0, current - 1))
    setError('')
    setSuccess('')
  }, [])

  const goNext = useCallback(() => {
    setActiveIndex((current) => Math.min(Math.max(0, pendingReviews.length - 1), current + 1))
    setError('')
    setSuccess('')
  }, [pendingReviews.length])

  function skipCurrent() {
    if (!activeReview) return
    setSkippedIds((current) => new Set([...current, activeReview.id]))
    setSuccess('Revision omitida temporalmente.')
    if (activeIndex < pendingReviews.length - 1) {
      setActiveIndex((current) => current + 1)
    } else {
      setActiveIndex(0)
      setSkippedIds(new Set())
    }
  }

  const handleSave = useCallback(async (detectionId: number, mode: 'stay' | 'next', override?: { species: string; note?: string; manualReviewStatus?: string }) => {
    setSavingId(detectionId)
    setError('')
    setSuccess('')

    try {
      const detection = pendingReviews.find((pendingReview) => pendingReview.id === detectionId)
      const species = override?.species ?? speciesByDetection[detectionId] ?? (detection?.species === 'Sin deteccion' ? '' : detection?.species) ?? ''
      if (!species.trim()) {
        throw new Error('Selecciona o escribe una especie antes de guardar la revision.')
      }
      const note = override?.note ?? notes[detectionId] ?? ''
      const manualReviewStatus = override?.manualReviewStatus ?? getManualReviewStatus({ originalSpecies: detection?.manualOriginalSpecies ?? detection?.species, reviewedSpecies: species.trim() })
      const updatedDetection = await completeManualReview(detectionId, species.trim(), note, detection?.reviewVersion ?? 0, manualReviewStatus)
      onReviewCompleted(updatedDetection)
      setNotes((currentNotes) => {
        const nextNotes = { ...currentNotes }
        delete nextNotes[detectionId]
        return nextNotes
      })
      setSpeciesByDetection((currentSpecies) => {
        const nextSpecies = { ...currentSpecies }
        delete nextSpecies[detectionId]
        return nextSpecies
      })
      setGroupByDetection((currentGroups) => {
        const nextGroups = { ...currentGroups }
        delete nextGroups[detectionId]
        return nextGroups
      })
      setSkippedIds((current) => {
        const next = new Set(current)
        next.delete(detectionId)
        return next
      })
      setSuccess(mode === 'next' ? 'Revision guardada. Cargando siguiente pendiente.' : 'Revision guardada correctamente.')
      if (mode === 'next') {
        setActiveIndex((current) => Math.min(current, Math.max(0, pendingReviews.length - 2)))
      }
    } catch (reviewError: unknown) {
      setError(reviewError instanceof Error ? reviewError.message : 'Error completando la revision')
    } finally {
      setSavingId(null)
    }
  }, [notes, onReviewCompleted, pendingReviews, speciesByDetection])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || !activeReview) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrevious()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      } else if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault()
        handleSave(activeReview.id, 'next')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeReview, goNext, goPrevious, handleSave])

  function confirmModelResult() {
    if (!activeReview) return
    const nextSpecies = activeReview.species === 'Sin deteccion' ? 'Sin deteccion' : activeReview.species
    updateSpecies(activeReview.id, nextSpecies)
    updateGroup(activeReview.id, getTaxonomicGroup(nextSpecies))
  }

  function markWithoutFauna() {
    if (!activeReview) return
    updateSpecies(activeReview.id, 'Sin deteccion')
    updateGroup(activeReview.id, 'Sin clasificar')
  }

  function markUnknown() {
    if (!activeReview) return
    updateSpecies(activeReview.id, 'Unknown')
    updateGroup(activeReview.id, 'Sin clasificar')
  }

  async function discardCurrent() {
    if (!activeReview) return
    const confirmed = window.confirm('Esta accion marcara la imagen como no evaluable. No se borrara fisicamente. Deseas continuar?')
    if (!confirmed) return
    await handleSave(activeReview.id, 'next', {
      species: 'Imagen no evaluable',
      note: buildReviewNote(currentNote, 'DESCARTADA / Imagen no evaluable'),
      manualReviewStatus: 'Descartada'
    })
  }

  if (!activeReview) {
    return (
      <section className="manualReviewsView manualReviewWorkspace" aria-label={text.reviews}>
        <section className="reviewsEmpty compactReviewsEmpty">
          <CheckCircle2 size={34} />
          <h2>No hay revisiones pendientes</h2>
          <p>Cuando un analisis requiera validacion manual, aparecera en este apartado.</p>
        </section>
      </section>
    )
  }

  const speciesLabel = getSpeciesLabel(activeReview.species, language)
  const stateLabel = reviewStateLabel(activeReview)
  const hasBox = hasBoundingBox(activeReview)

  return (
    <section className="manualReviewsView manualReviewWorkspace" aria-label={text.reviews}>
      <header className="manualReviewHeader">
        <div>
          <span>Revisiones manuales</span>
          <h2>Revisiones manuales</h2>
        </div>
        <div className="manualReviewHeaderMeta">
          <strong>Pendientes: {reviewStats.total}</strong>
          <span>{activeIndex + 1} de {pendingReviews.length}</span>
        </div>
      </header>

      <div className="smartReviewSummary" aria-label="Resumen de revisiones inteligentes">
        <button className={queueFilter === 'all' ? 'active' : ''} onClick={() => setQueueFilter('all')} type="button">
          <strong>{reviewStats.total}</strong>
          <span>Todas</span>
        </button>
        <button className={queueFilter === 'broad' ? 'active' : ''} disabled={reviewStats.broad === 0} onClick={() => setQueueFilter('broad')} type="button">
          <strong>{reviewStats.broad}</strong>
          <span>Amplias</span>
        </button>
        <button className={queueFilter === 'lowConfidence' ? 'active' : ''} disabled={reviewStats.lowConfidence === 0} onClick={() => setQueueFilter('lowConfidence')} type="button">
          <strong>{reviewStats.lowConfidence}</strong>
          <span>Baja confianza</span>
        </button>
        <button className={queueFilter === 'priority' ? 'active' : ''} disabled={reviewStats.priority === 0} onClick={() => setQueueFilter('priority')} type="button">
          <strong>{reviewStats.priority}</strong>
          <span>Prioridad alta</span>
        </button>
      </div>

      <div className="manualReviewNavBar">
        <button className="secondaryButton" disabled={activeIndex === 0} onClick={goPrevious} type="button"><ChevronLeft size={16} /> Anterior</button>
        <div className="reviewProgressInline">
          <span>{reviewedCount} revisada{reviewedCount === 1 ? '' : 's'} de {totalReviewLike || reviewStats.total}</span>
          <div><i style={{ width: `${progressValue}%` }} /></div>
        </div>
        <button className="secondaryButton" disabled={activeIndex >= pendingReviews.length - 1} onClick={goNext} type="button">Siguiente <ChevronRight size={16} /></button>
        <button className="secondaryButton" onClick={() => setShowQueue((current) => !current)} type="button"><ListChecks size={16} /> Pendientes</button>
      </div>

      {error ? <div className="statusBanner">{error}</div> : null}
      {success ? <div className="statusBanner successBanner">{success}</div> : null}

      {showQueue ? (
        <aside className="manualReviewQueue" aria-label="Lista de revisiones pendientes">
          {pendingReviewItemsForFilter.map(({ detection, reasons }, index) => (
            <button className={index === activeIndex ? 'active' : ''} key={detection.id} onClick={() => { setActiveIndex(index); setShowQueue(false) }} type="button">
              <img alt={getSpeciesLabel(detection.species, language)} src={detection.imagePath} />
              <span>
                <strong>{getSpeciesLabel(detection.species, language)}</strong>
                <small>{detection.camera?.code ?? detection.location} | {formatDateOnly(detection.capturedAt, language)}</small>
                <i>{reasons.slice(0, 2).join(' | ')}</i>
              </span>
              <em>{formatConfidence(detection.confidence)}</em>
            </button>
          ))}
        </aside>
      ) : null}

      <div className="manualReviewMainLayout">
        <ManualReviewImageViewer detection={activeReview} language={language} />

        <aside className="manualReviewSidebar">
          <section className="manualSidebarSection modelResultSection">
            <div className="manualSectionTitle"><span>Resultado del modelo</span><em className={`reviewStatePill ${stateLabel.toLowerCase().replace(/\s+/g, '-')}`}>{stateLabel}</em></div>
            <h3>{speciesLabel}</h3>
            <dl className="manualInfoGrid">
              <div><dt>Etiqueta original</dt><dd>{activeReview.species}</dd></div>
              <div><dt>Confianza</dt><dd>{formatConfidence(activeReview.confidence)}</dd></div>
              <div><dt>Prioridad</dt><dd>{activeReview.priority}</dd></div>
              <div><dt>Motivo</dt><dd>{activeReviewReasons.join(', ')}</dd></div>
              <div><dt>Bounding box</dt><dd>{hasBox ? 'Disponible' : 'No disponible'}</dd></div>
            </dl>
          </section>

          <section className="manualSidebarSection captureInfoSection">
            <div className="manualSectionTitle"><span>Informacion de captura</span></div>
            <dl className="manualInfoGrid compactInfoGrid">
              <div><dt>Camara</dt><dd>{activeReview.camera?.code ?? 'Sin camara'}</dd></div>
              <div><dt>Zona</dt><dd>{activeReview.camera?.zone ?? activeReview.location}</dd></div>
              <div><dt>Lote</dt><dd>{activeReview.batchJobId ? `Lote #${activeReview.batchJobId}` : 'Sin lote'}</dd></div>
              <div><dt>Archivo</dt><dd>{getFilename(activeReview.imagePath)}</dd></div>
              <div><dt>Fecha de captura</dt><dd>{formatDateOnly(activeReview.capturedAt, language)}</dd></div>
              <div><dt>Hora de captura</dt><dd>{formatTimeOnly(activeReview.capturedAt, language)}</dd></div>
              <div><dt>Fuente de fecha</dt><dd>{formatCaptureSource(activeReview.captureDateSource)}</dd></div>
              <div><dt>Procesamiento</dt><dd>{formatDateTime(activeReview.createdAt, language)}</dd></div>
            </dl>
          </section>

          <section className="manualSidebarSection manualClassificationSection">
            <div className="manualSectionTitle"><span>Clasificacion manual</span></div>
            <div className="quickReviewActions">
              <button className="secondaryButton" onClick={confirmModelResult} type="button">Confirmar modelo</button>
              <button className="secondaryButton" onClick={markWithoutFauna} type="button">Sin fauna</button>
              <button className="secondaryButton" onClick={markUnknown} type="button">Especie no identificada</button>
            </div>
            <SpeciesAutocomplete
              group={currentGroup}
              onGroupChange={(group) => updateGroup(activeReview.id, group)}
              onSpeciesChange={(species) => updateSpecies(activeReview.id, species)}
              options={autocompleteOptions}
              species={currentSpecies}
            />
            {activeQuickSuggestions.length > 0 ? (
              <div className="quickSpeciesSuggestions" aria-label="Sugerencias rapidas de especie">
                <span>Sugerencias rapidas</span>
                <div>
                  {activeQuickSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.value}
                      onClick={() => {
                        updateSpecies(activeReview.id, suggestion.value)
                        updateGroup(activeReview.id, suggestion.group)
                      }}
                      type="button"
                    >
                      <strong>{suggestion.label}</strong>
                      <small>{suggestion.value}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="reviewNote compactReviewNote">
              <span>Observaciones</span>
              <textarea
                onChange={(event) => setNotes((currentNotes) => ({ ...currentNotes, [activeReview.id]: event.target.value }))}
                placeholder="Agrega una observacion sobre la identificacion, calidad de imagen o motivo de correccion."
                value={currentNote}
              />
            </label>
          </section>

          <section className="manualSidebarSection auditInfoSection">
            <div className="manualSectionTitle"><span>Historial y auditoria</span></div>
            <dl className="manualInfoGrid compactInfoGrid">
              <div><dt>Resultado original</dt><dd>{activeReview.manualOriginalSpecies ?? activeReview.species}</dd></div>
              <div><dt>Correccion manual</dt><dd>{activeReview.manualCorrectedSpecies ?? (currentSpecies || 'Pendiente')}</dd></div>
              <div><dt>Revisado por</dt><dd>{activeReview.reviewedBy?.name ?? 'Pendiente'}</dd></div>
              <div><dt>Fecha de revision</dt><dd>{activeReview.manualReviewedAt ? formatDateTime(activeReview.manualReviewedAt, language) : 'Pendiente'}</dd></div>
            </dl>
          </section>

          <section className="manualReviewActions">
            <button className="primaryButton" disabled={savingId === activeReview.id} onClick={() => handleSave(activeReview.id, 'next')} type="button"><CheckCircle2 size={17} /> {savingId === activeReview.id ? 'Guardando...' : 'Guardar y siguiente'}</button>
            <button className="secondaryButton" disabled={savingId === activeReview.id} onClick={() => handleSave(activeReview.id, 'stay')} type="button"><BadgeCheck size={17} /> Guardar revision</button>
            <button className="secondaryButton" onClick={skipCurrent} type="button"><SkipForward size={17} /> Omitir por ahora</button>
            <button className="dangerSoftButton" disabled={savingId === activeReview.id} onClick={discardCurrent} type="button"><Trash2 size={17} /> Descartar imagen</button>
          </section>

          <section className="manualShortcutHelp">
            <Keyboard size={15} />
            <span>{'Atajos: Flecha izquierda/derecha navegar | Ctrl+Enter guardar | + - zoom | 0 ajustar | F pantalla completa | B cuadro'}</span>
          </section>
        </aside>
      </div>
    </section>
  )
}
