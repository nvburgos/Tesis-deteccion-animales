'use client'

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, CalendarClock, FileArchive, Image, Loader2, UploadCloud } from 'lucide-react'

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kb = bytes / 1024

  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`
  }

  return `${(kb / 1024).toFixed(1)} MB`
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Sin procesamientos previos'
  }

  return new Date(value).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function estimateZipImages(file: File) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder()
  let count = 0

  for (let index = 0; index < bytes.length - 46; index += 1) {
    if (bytes[index] !== 0x50 || bytes[index + 1] !== 0x4b || bytes[index + 2] !== 0x01 || bytes[index + 3] !== 0x02) {
      continue
    }

    const nameLength = bytes[index + 28] | (bytes[index + 29] << 8)
    const extraLength = bytes[index + 30] | (bytes[index + 31] << 8)
    const commentLength = bytes[index + 32] | (bytes[index + 33] << 8)
    const nameStart = index + 46
    const nameEnd = nameStart + nameLength
    const name = decoder.decode(bytes.slice(nameStart, nameEnd)).toLowerCase()

    if (/\.(jpe?g|png|webp)$/i.test(name)) {
      count += 1
    }

    index = nameEnd + extraLength + commentLength - 1
  }

  return count
}

export default function BatchUploadPanel({
  file,
  isProcessing,
  lastProcessedAt,
  onAnalyze,
  onZipSelected
}: {
  file: File | null
  isProcessing: boolean
  lastProcessedAt?: string | null
  onAnalyze: () => void
  onZipSelected: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [imageEstimate, setImageEstimate] = useState('Pendiente de seleccionar ZIP')

  useEffect(() => {
    let isCancelled = false

    if (!file) {
      setImageEstimate('Pendiente de seleccionar ZIP')
      return
    }

    setImageEstimate('Calculando...')
    estimateZipImages(file)
      .then((count) => {
        if (!isCancelled) {
          setImageEstimate(count > 0 ? count.toLocaleString('es-ES') : 'No se pudo estimar')
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setImageEstimate('No se pudo estimar')
        }
      })

    return () => {
      isCancelled = true
    }
  }, [file])

  const selectedFileLabel = useMemo(() => file?.name ?? 'Ningun ZIP seleccionado', [file])

  function handleFile(fileCandidate: File | undefined) {
    if (fileCandidate?.name.toLowerCase().endsWith('.zip')) {
      onZipSelected(fileCandidate)
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0])
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    handleFile(event.dataTransfer.files?.[0])
  }

  return (
    <section className="batchUploadPanel" aria-label="Procesar nuevo lote">
      <div className="panelHeader batchUploadHeader">
        <div>
          <h2>Procesar nuevo lote</h2>
          <p>Carga un archivo ZIP con imagenes obtenidas por esta camara trampa.</p>
        </div>
        <span className="formatPill">ZIP</span>
      </div>

      <div
        className={file ? 'zipDropZone hasZip' : 'zipDropZone'}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            inputRef.current?.click()
          }
        }}
        role="button"
        tabIndex={0}
      >
        <input ref={inputRef} accept=".zip,application/zip" className="fileInput" onChange={handleChange} type="file" />
        <span className="zipDropIcon">
          {file ? <FileArchive size={36} /> : <UploadCloud size={38} />}
        </span>
        <strong>{file ? selectedFileLabel : 'Arrastra un ZIP o seleccionalo manualmente'}</strong>
        <small>{file ? 'Archivo listo para iniciar el analisis' : 'Formatos permitidos: ZIP'}</small>
      </div>

      <div className="batchFileSummary">
        <div>
          <span>Archivo</span>
          <strong>{selectedFileLabel}</strong>
        </div>
        <div>
          <span>Tamano</span>
          <strong>{file ? formatFileSize(file.size) : '-'}</strong>
        </div>
        <div>
          <span>Imagenes estimadas</span>
          <strong><Image size={16} /> {imageEstimate}</strong>
        </div>
        <div>
          <span>Ultimo procesamiento</span>
          <strong><CalendarClock size={16} /> {formatDate(lastProcessedAt)}</strong>
        </div>
      </div>

      <div className="batchUploadActions">
        <button className="primaryButton" disabled={!file || isProcessing} onClick={onAnalyze} type="button">
          {isProcessing ? <Loader2 className="spinIcon" size={18} /> : <Archive size={18} />}
          {isProcessing ? 'Procesando lote' : 'Iniciar analisis'}
        </button>
        <button className="secondaryButton" onClick={() => inputRef.current?.click()} type="button">
          Seleccionar ZIP
        </button>
      </div>
    </section>
  )
}
