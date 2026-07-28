'use client'

import Link from 'next/link'
import { Camera, Edit3, Images, MapPin, MoreVertical, PawPrint, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { CameraSummary } from './dashboardTypes'

function formatLastUpload(value: string | null) {
  if (!value) {
    return 'Sin cargas registradas'
  }

  return new Date(value).toLocaleDateString('es-ES', { dateStyle: 'medium' })
}

type CameraCardProps = {
  camera: CameraSummary
  onDelete: (camera: CameraSummary) => void
  onEdit: (camera: CameraSummary) => void
}

export default function CameraCard({ camera, onDelete, onEdit }: CameraCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <article className="cameraCard">
      <div className="cameraCardTop">
        <span className="cameraIcon" aria-hidden="true">
          <Camera size={24} />
        </span>
        <div className="cameraTopActions">
          <span className="cameraCode">{camera.code}</span>
          <div className="cameraMenu">
            <button
              aria-label="Opciones de camara"
              className="cameraMenuButton"
              onClick={() => setIsMenuOpen((current) => !current)}
              type="button"
            >
              <MoreVertical size={18} />
            </button>
            {isMenuOpen ? (
              <div className="cameraMenuList">
                <button
                  onClick={() => {
                    setIsMenuOpen(false)
                    onEdit(camera)
                  }}
                  type="button"
                >
                  <Edit3 size={15} />
                  Editar
                </button>
                <button
                  className="dangerMenuItem"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onDelete(camera)
                  }}
                  type="button"
                >
                  <Trash2 size={15} />
                  Eliminar
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="cameraCardBody">
        <h2>{camera.name}</h2>
        <p>{camera.description ?? 'Punto de monitoreo de camara trampa.'}</p>
      </div>

      <div className="cameraMetaList">
        <div>
          <MapPin size={17} />
          <span>
            {camera.zone}
            {camera.latitude !== null && camera.latitude !== undefined && camera.longitude !== null && camera.longitude !== undefined
              ? ` (${camera.latitude.toFixed(5)}, ${camera.longitude.toFixed(5)})`
              : ''}
          </span>
        </div>
        <div>
          <Images size={17} />
          <span>{camera.totalImagesProcessed} imagenes procesadas</span>
        </div>
        <div>
          <PawPrint size={17} />
          <span>{camera.totalSpeciesDetected} especies detectadas</span>
        </div>
      </div>

      <div className="cameraCardFooter">
        <span>
          Ultima carga
          <strong>{formatLastUpload(camera.lastUploadAt)}</strong>
        </span>
        <Link className="primaryButton cameraOpenButton" href={`/cameras/${camera.id}`}>
          Abrir camara
        </Link>
      </div>
    </article>
  )
}
