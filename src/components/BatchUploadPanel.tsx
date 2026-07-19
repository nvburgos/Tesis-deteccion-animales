'use client'

import { ChangeEvent, DragEvent, useMemo, useRef } from 'react'
import { Archive, FileArchive, Loader2, UploadCloud } from 'lucide-react'

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

export default function BatchUploadPanel({
  file,
  isProcessing,
  onAnalyze,
  onZipSelected
}: {
  file: File | null
  isProcessing: boolean
  onAnalyze: () => void
  onZipSelected: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const imageEstimate = useMemo(() => (file ? 'Se calculara al iniciar el procesamiento' : 'Pendiente de seleccionar ZIP'), [file])

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
        className="zipDropZone"
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
          <FileArchive size={34} />
        </span>
        <strong>Arrastra un ZIP o seleccionalo manualmente</strong>
        <small>Formatos permitidos: ZIP</small>
      </div>

      <div className="batchFileSummary">
        <div>
          <span>Archivo</span>
          <strong>{file?.name ?? 'Ningun ZIP seleccionado'}</strong>
        </div>
        <div>
          <span>Tamano</span>
          <strong>{file ? formatFileSize(file.size) : '-'}</strong>
        </div>
        <div>
          <span>Imagenes estimadas</span>
          <strong>{imageEstimate}</strong>
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
