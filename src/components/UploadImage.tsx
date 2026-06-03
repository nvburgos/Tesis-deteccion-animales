'use client'

import { ChangeEvent, DragEvent, useRef } from 'react'
import { ImagePlus, Loader2, UploadCloud } from 'lucide-react'
import type { UiText } from '@/lib/i18n'

type UploadImageProps = {
  fileName: string
  imagePreview: string
  isAnalyzing: boolean
  onAnalyze: () => void
  onFileSelected: (file: File) => void
  text: UiText
}

export default function UploadImage({
  fileName,
  imagePreview,
  isAnalyzing,
  onAnalyze,
  onFileSelected,
  text
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
          accept="image/*"
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
            <span>{text.uploadSubprompt}</span>
          </div>
        )}
      </div>

      <div className="uploadFooter">
        <span className="selectedFile">{fileName || text.noImageSelected}</span>
        <button className="primaryButton" disabled={!imagePreview || isAnalyzing} onClick={onAnalyze} type="button">
          {isAnalyzing ? <Loader2 className="spinIcon" size={18} /> : <UploadCloud size={18} />}
          {isAnalyzing ? text.analyzing : text.analyzeImage}
        </button>
      </div>
    </section>
  )
}
