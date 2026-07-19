'use client'

import { useEffect, useState } from 'react'
import { Camera, Plus } from 'lucide-react'
import CameraCard from './CameraCard'
import CameraFormModal from './CameraFormModal'
import Header from './Header'
import Sidebar from './Sidebar'
import type { CameraSummary } from './dashboardTypes'

type CamerasResponse = {
  cameras: CameraSummary[]
}

type DeleteResponse = {
  ok?: boolean
  error?: string
}

async function loadCameras() {
  const response = await fetch('/api/cameras', { cache: 'no-store' })
  const data = (await response.json().catch(() => null)) as Partial<CamerasResponse> & { error?: string } | null

  if (!response.ok || !data?.cameras) {
    throw new Error(data?.error ?? 'No se pudieron cargar las camaras')
  }

  return data.cameras
}

export default function CamerasPanel() {
  const [cameras, setCameras] = useState<CameraSummary[]>([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCamera, setEditingCamera] = useState<CameraSummary | null>(null)

  useEffect(() => {
    loadCameras()
      .then(setCameras)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Error cargando camaras')
      })
      .finally(() => setIsLoading(false))
  }, [])

  function openCreateModal() {
    setEditingCamera(null)
    setIsModalOpen(true)
  }

  function handleSaved(camera: CameraSummary) {
    setCameras((current) => {
      const exists = current.some((item) => item.id === camera.id)

      if (exists) {
        return current.map((item) => (item.id === camera.id ? camera : item))
      }

      return [...current, camera].sort((left, right) => left.code.localeCompare(right.code))
    })
  }

  async function handleDelete(camera: CameraSummary) {
    const confirmed = window.confirm(`¿Eliminar ${camera.name}? La camara no se borrara fisicamente.`)

    if (!confirmed) {
      return
    }

    setError('')

    try {
      const response = await fetch(`/api/cameras/${camera.id}`, { method: 'DELETE' })
      const data = (await response.json().catch(() => null)) as DeleteResponse | null

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? 'No se pudo eliminar la camara')
      }

      setCameras((current) => current.filter((item) => item.id !== camera.id))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar la camara')
    }
  }

  return (
    <main className="dashboardShell">
      <Sidebar />
      <section className="dashboardMain">
        <Header
          title="Panel de Control"
          subtitle="Selecciona una camara trampa para cargar imagenes, procesar lotes y consultar sus resultados"
        />

        <div className="contentArea">
          {error ? <div className="statusBanner">{error}</div> : null}

          <section className="camerasIntro">
            <div>
              <span>Origen de imagenes</span>
              <h1>Camaras trampa registradas</h1>
              <p>Las camaras identifican el punto donde se capturaron las imagenes. No representan dispositivos conectados en tiempo real.</p>
            </div>
            <div className="camerasHeaderActions">
              <strong>{isLoading ? '...' : cameras.length}</strong>
              <button className="primaryButton" onClick={openCreateModal} type="button">
                <Plus size={18} />
                + Nueva cámara
              </button>
            </div>
          </section>

          {isLoading ? <div className="emptyState">Cargando camaras...</div> : null}

          {!isLoading && cameras.length > 0 ? (
            <section className="camerasGrid" aria-label="Camaras trampa">
              {cameras.map((camera) => (
                <CameraCard
                  camera={camera}
                  key={camera.id}
                  onDelete={handleDelete}
                  onEdit={(selectedCamera) => {
                    setEditingCamera(selectedCamera)
                    setIsModalOpen(true)
                  }}
                />
              ))}
            </section>
          ) : null}

          {!isLoading && cameras.length === 0 && !error ? (
            <section className="camerasEmptyState">
              <span aria-hidden="true">
                <Camera size={30} />
              </span>
              <h2>Aún no existen cámaras registradas</h2>
              <p>Agrega una cámara para comenzar a organizar las imágenes provenientes de cámaras trampa.</p>
              <button className="primaryButton" onClick={openCreateModal} type="button">
                Agregar primera cámara
              </button>
            </section>
          ) : null}
        </div>
      </section>

      <CameraFormModal
        camera={editingCamera}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleSaved}
      />
    </main>
  )
}


