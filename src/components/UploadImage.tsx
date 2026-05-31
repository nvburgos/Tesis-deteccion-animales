'use client'

import { ChangeEvent, DragEvent, useRef } from 'react'
import { ImagePlus, Loader2, UploadCloud } from 'lucide-react'

type UploadImageProps = {
  fileName: string
  imagePreview: string
  isAnalyzing: boolean
  onAnalyze: () => void
  onFileSelected: (file: File) => void
}

export default function UploadImage({
  fileName,
  imagePreview,
  isAnalyzing,
  onAnalyze,
  onFileSelected
}: UploadImageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (file) {
      onFileSelected(file)
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]

    if (file?.type.startsWith('image/')) {
      onFileSelected(file)
    }
  }

  return (
    <section className="uploadPanel" aria-label="Carga de imagen de cámara trampa">
      <div className="panelHeader uploadHeader">
        <div>
          <h2>Cargar imagen de cámara trampa</h2>
          <p>Sube una fotografía para que el modelo estime la especie y prioridad.</p>
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
          accept="image/*"
          className="fileInput"
          onChange={handleFileChange}
          type="file"
        />

        {imagePreview ? (
          <img alt="Vista previa de cámara trampa" className="previewImage" src={imagePreview} />
        ) : (
          <div className="dropZoneEmpty">
            <span className="dropZoneIcon">
              <ImagePlus size={30} />
            </span>
            <strong>Arrastra una imagen aquí</strong>
            <span>o haz clic para seleccionar un archivo JPG o PNG</span>
          </div>
        )}
      </div>

      <div className="uploadFooter">
        <span className="selectedFile">{fileName || 'Ninguna imagen seleccionada'}</span>
        <button className="primaryButton" disabled={!imagePreview || isAnalyzing} onClick={onAnalyze} type="button">
          {isAnalyzing ? <Loader2 className="spinIcon" size={18} /> : <UploadCloud size={18} />}
          {isAnalyzing ? 'Procesando...' : 'Analizar imagen'}
        </button>
      </div>
    </section>
  )
}
