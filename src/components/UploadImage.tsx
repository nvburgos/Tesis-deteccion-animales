'use client'

import { ChangeEvent, DragEvent, useRef } from 'react'
import { Archive, ImagePlus, Loader2, UploadCloud } from 'lucide-react'
import type { UiText } from '@/lib/i18n'

type UploadImageProps = {
  analysisProgress?: number
  batchFileName?: string
  fileName: string
  imagePreview: string
  isAnalyzing: boolean
  isBatchProcessing?: boolean
  onAnalyze: () => void
  onBatchAnalyze?: () => void
  onFileSelected: (file: File) => void
  onZipSelected?: (file: File) => void
  text: UiText
}

export default function UploadImage({
  analysisProgress = 0,
  batchFileName = '',
  fileName,
  imagePreview,
  isAnalyzing,
  isBatchProcessing = false,
  onAnalyze,
  onBatchAnalyze,
  onFileSelected,
  onZipSelected,
  text
}: UploadImageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isProcessing = isAnalyzing || isBatchProcessing
  const progressLabel = batchFileName ? 'Procesando lote' : 'Analizando imagen'

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (file?.name.toLowerCase().endsWith('.zip')) {
      onZipSelected?.(file)
      return
    }

    if (file?.type.startsWith('image/')) {
      onFileSelected(file)
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]

    if (file?.name.toLowerCase().endsWith('.zip')) {
      onZipSelected?.(file)
      return
    }

    if (file?.type.startsWith('image/')) {
      onFileSelected(file)
    }
  }

  return (
    <section className="uploadPanel" aria-label={text.uploadPanel}>
      <div className="panelHeader uploadHeader">
        <div>
          <h2>{text.uploadImage}</h2>
          <p>{text.uploadHint}</p>
        </div>
      </div>

      <div
        className={imagePreview ? 'dropZone hasPreview' : 'dropZone'}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            fileInputRef.current?.click()
          }
        }}
      >
        <input
          ref={fileInputRef}
          accept="image/*,.zip,application/zip"
          className="fileInput"
          onChange={handleFileChange}
          type="file"
        />

        {imagePreview ? (
          <img alt={text.selectedFileAlt} className="previewImage" src={imagePreview} />
        ) : (
          <div className="dropZoneEmpty">
            <span className="dropZoneIcon">
              <ImagePlus size={30} />
            </span>
            <strong>{text.uploadPrompt}</strong>
            <span>{text.uploadSubprompt} Tambien puedes subir un ZIP con varias imagenes.</span>
          </div>
        )}
      </div>

      <div className="uploadFooter">
        <span className="selectedFile">{batchFileName || fileName || text.noImageSelected}</span>
        <div className="uploadActions">
          {batchFileName ? (
            <button className="primaryButton" disabled={isBatchProcessing} onClick={onBatchAnalyze} type="button">
              {isBatchProcessing ? <Loader2 className="spinIcon" size={18} /> : <Archive size={18} />}
              {isBatchProcessing ? 'Procesando lote' : 'Procesar ZIP'}
            </button>
          ) : (
            <button className="primaryButton" disabled={!imagePreview || isAnalyzing} onClick={onAnalyze} type="button">
              {isAnalyzing ? <Loader2 className="spinIcon" size={18} /> : <UploadCloud size={18} />}
              {isAnalyzing ? text.analyzing : text.analyzeImage}
            </button>
          )}
        </div>
      </div>

      {isProcessing ? (
        <div className="analysisProgress" aria-label={progressLabel} aria-valuemax={100} aria-valuemin={0} aria-valuenow={analysisProgress} role="progressbar">
          <div className="analysisProgressMeta">
            <span>{progressLabel}</span>
            <strong>{analysisProgress}%</strong>
          </div>
          <div className="analysisProgressTrack">
            <span style={{ width: `${analysisProgress}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  )
}
