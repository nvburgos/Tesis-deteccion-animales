'use client'

import { useState } from 'react'

type DetectionImageProps = {
  imagePath?: string
  species?: string | null
  confidence?: number
  coordinates?: [number, number, number, number] | null
}

function formatConfidence(confidence = 0) {
  const percent = confidence <= 1 ? confidence * 100 : confidence
  return `${Math.round(percent)}%`
}

export default function DetectionImage({ imagePath, species, confidence = 0, coordinates }: DetectionImageProps) {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const hasDetection = Boolean(imagePath && species && species !== 'Sin deteccion' && coordinates && imageSize.width)

  const box = hasDetection
    ? {
        left: `${(coordinates![0] / imageSize.width) * 100}%`,
        top: `${(coordinates![1] / imageSize.height) * 100}%`,
        width: `${((coordinates![2] - coordinates![0]) / imageSize.width) * 100}%`,
        height: `${((coordinates![3] - coordinates![1]) / imageSize.height) * 100}%`
      }
    : null

  if (!imagePath) {
    return (
      <div className="detectionImageEmpty">
        <strong>No se detectó ningún animal</strong>
        <span>Analiza una imagen para visualizar la deteccion.</span>
      </div>
    )
  }

  return (
    <div className="detectionImageFrame">
      <img
        alt={species ? `Imagen analizada: ${species}` : 'Imagen analizada'}
        className="detectionImage"
        onLoad={(event) => {
          setImageSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight
          })
        }}
        src={imagePath}
      />

      {box ? (
        <div className="detectionBox" style={box}>
          <span className="detectionBoxLabel">{species}</span>
          <span className="detectionBoxConfidence">{formatConfidence(confidence)}</span>
        </div>
      ) : (
        <div className="noDetectionOverlay">
          <strong>No se detectó ningún animal</strong>
        </div>
      )}
    </div>
  )
}
