'use client'

import { FormEvent, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import CameraLocationPicker from './CameraLocationPicker'
import type { CameraSummary } from './dashboardTypes'

type CameraFormModalProps = {
  camera: CameraSummary | null
  isOpen: boolean
  onClose: () => void
  onSaved: (camera: CameraSummary) => void
}

type CameraResponse = {
  camera?: CameraSummary
  error?: string
}

const emptyForm = {
  name: '',
  code: '',
  zone: '',
  description: '',
  latitude: '',
  longitude: ''
}

export default function CameraFormModal({ camera, isOpen, onClose, onSaved }: CameraFormModalProps) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setError('')
    setForm(
      camera
        ? {
            name: camera.name,
            code: camera.code,
            zone: camera.zone,
            description: camera.description ?? '',
            latitude: camera.latitude === null || camera.latitude === undefined ? '' : String(camera.latitude),
            longitude: camera.longitude === null || camera.longitude === undefined ? '' : String(camera.longitude)
          }
        : emptyForm
    )
  }, [camera, isOpen])

  if (!isOpen) {
    return null
  }

  const isEditing = Boolean(camera)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!form.name.trim() || !form.code.trim() || !form.zone.trim()) {
      setError('Nombre, codigo y zona son obligatorios')
      return
    }

    const hasLatitude = form.latitude.trim().length > 0
    const hasLongitude = form.longitude.trim().length > 0
    const latitude = Number(form.latitude)
    const longitude = Number(form.longitude)

    if (hasLatitude !== hasLongitude) {
      setError('Selecciona latitud y longitud, o deja ambas vacias')
      return
    }

    if (
      (hasLatitude && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (hasLongitude && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
    ) {
      setError('Coordenadas invalidas')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(isEditing && camera ? `/api/cameras/${camera.id}` : '/api/cameras', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim(),
          zone: form.zone.trim(),
          description: form.description.trim(),
          latitude: hasLatitude ? latitude : null,
          longitude: hasLongitude ? longitude : null
        })
      })
      const data = (await response.json().catch(() => null)) as CameraResponse | null

      if (!response.ok || !data?.camera) {
        throw new Error(data?.error ?? 'No se pudo guardar la camara')
      }

      onSaved(data.camera)
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo guardar la camara')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modalBackdrop" role="presentation">
      <section aria-modal="true" className="cameraModal" role="dialog">
        <div className="cameraModalHeader">
          <div>
            <span>Camara trampa</span>
            <h2>{isEditing ? 'Editar camara' : 'Nueva camara'}</h2>
          </div>
          <button aria-label="Cerrar" className="iconButton" onClick={onClose} type="button">
            <X size={19} />
          </button>
        </div>

        <form className="cameraForm" onSubmit={handleSubmit}>
          {error ? <div className="loginError">{error}</div> : null}

          <label className="fieldGroup">
            <span>Nombre</span>
            <input
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Nombre de la camara"
              value={form.name}
            />
          </label>

          <label className="fieldGroup">
            <span>Codigo (ID)</span>
            <input
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              placeholder="Codigo unico"
              value={form.code}
            />
          </label>

          <label className="fieldGroup">
            <span>Zona</span>
            <input
              onChange={(event) => setForm((current) => ({ ...current, zone: event.target.value }))}
              placeholder="Zona o sector"
              value={form.zone}
            />
          </label>

          <label className="fieldGroup">
            <span>Descripcion</span>
            <textarea
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Punto de ubicacion o descripcion breve"
              rows={4}
              value={form.description}
            />
          </label>

          <CameraLocationPicker
            latitude={form.latitude}
            longitude={form.longitude}
            onChange={(coordinates) => setForm((current) => ({ ...current, ...coordinates }))}
            onError={setError}
          />

          <div className="modalActions">
            <button className="secondaryButton" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="primaryButton" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}


