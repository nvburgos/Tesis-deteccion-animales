'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import { LocateFixed, MapPin, Minus, Plus, X } from 'lucide-react'

type CameraLocationPickerProps = {
  latitude: string
  longitude: string
  onChange: (coordinates: { latitude: string; longitude: string }) => void
  onError: (message: string) => void
}

const tileSize = 256
const mapWidth = 680
const mapHeight = 320
const defaultCenter = { latitude: -2.1894, longitude: -79.8891 }
const defaultZoom = 12
const minZoom = 5
const maxZoom = 18

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function longitudeToWorldX(longitude: number, zoom: number) {
  return ((longitude + 180) / 360) * tileSize * 2 ** zoom
}

function latitudeToWorldY(latitude: number, zoom: number) {
  const sinLatitude = Math.sin((latitude * Math.PI) / 180)
  return (
    (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) *
    tileSize *
    2 ** zoom
  )
}

function worldXToLongitude(x: number, zoom: number) {
  return (x / (tileSize * 2 ** zoom)) * 360 - 180
}

function worldYToLatitude(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / (tileSize * 2 ** zoom)
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

function parseCoordinate(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCoordinate(value: number) {
  return value.toFixed(6)
}

export default function CameraLocationPicker({ latitude, longitude, onChange, onError }: CameraLocationPickerProps) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const [mapCenter, setMapCenter] = useState(defaultCenter)
  const [zoom, setZoom] = useState(defaultZoom)
  const suppressNextClickRef = useRef(false)
  const dragStartRef = useRef<{
    clientX: number
    clientY: number
    centerLatitude: number
    centerLongitude: number
    moved: boolean
  } | null>(null)
  const selectedLatitude = parseCoordinate(latitude)
  const selectedLongitude = parseCoordinate(longitude)
  const centerLatitude = mapCenter.latitude
  const centerLongitude = mapCenter.longitude
  const centerX = longitudeToWorldX(centerLongitude, zoom)
  const centerY = latitudeToWorldY(centerLatitude, zoom)
  const topLeftX = centerX - mapWidth / 2
  const topLeftY = centerY - mapHeight / 2
  const firstTileX = Math.floor(topLeftX / tileSize)
  const lastTileX = Math.floor((topLeftX + mapWidth) / tileSize)
  const firstTileY = Math.floor(topLeftY / tileSize)
  const lastTileY = Math.floor((topLeftY + mapHeight) / tileSize)
  const tiles = useMemo(() => {
    const tileItems = []
    const maxTile = 2 ** zoom

    for (let x = firstTileX; x <= lastTileX; x += 1) {
      for (let y = firstTileY; y <= lastTileY; y += 1) {
        if (y >= 0 && y < maxTile) {
          tileItems.push({ x: ((x % maxTile) + maxTile) % maxTile, rawX: x, y })
        }
      }
    }

    return tileItems
  }, [firstTileX, firstTileY, lastTileX, lastTileY, zoom])

  const marker =
    selectedLatitude !== null && selectedLongitude !== null
      ? {
          x: longitudeToWorldX(selectedLongitude, zoom) - topLeftX,
          y: latitudeToWorldY(selectedLatitude, zoom) - topLeftY
        }
      : null

  function selectCoordinates(clickX: number, clickY: number) {
    const nextLongitude = clamp(worldXToLongitude(topLeftX + clickX, zoom), -180, 180)
    const nextLatitude = clamp(worldYToLatitude(topLeftY + clickY, zoom), -85, 85)

    setMapCenter({ latitude: nextLatitude, longitude: nextLongitude })
    onChange({
      latitude: formatCoordinate(nextLatitude),
      longitude: formatCoordinate(nextLongitude)
    })
  }

  function handleMapClick(event: MouseEvent<HTMLDivElement>) {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const scaleX = mapWidth / bounds.width
    const scaleY = mapHeight / bounds.height
    const clickX = (event.clientX - bounds.left) * scaleX
    const clickY = (event.clientY - bounds.top) * scaleY

    selectCoordinates(clickX, clickY)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    suppressNextClickRef.current = false
    dragStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      centerLatitude,
      centerLongitude,
      moved: false
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current

    if (!dragStart || !event.currentTarget.hasPointerCapture(event.pointerId)) return

    const deltaX = event.clientX - dragStart.clientX
    const deltaY = event.clientY - dragStart.clientY

    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) {
      dragStart.moved = true
    }

    const startX = longitudeToWorldX(dragStart.centerLongitude, zoom)
    const startY = latitudeToWorldY(dragStart.centerLatitude, zoom)
    const nextCenter = {
      latitude: clamp(worldYToLatitude(startY - deltaY, zoom), -85, 85),
      longitude: clamp(worldXToLongitude(startX - deltaX, zoom), -180, 180)
    }

    setMapCenter(nextCenter)
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragStartRef.current?.moved) {
      suppressNextClickRef.current = true
    }

    dragStartRef.current = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    dragStartRef.current = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function changeZoom(nextZoom: number) {
    setZoom(clamp(nextZoom, minZoom, maxZoom))
  }

  useEffect(() => {
    const mapElement = mapRef.current

    if (!mapElement) return

    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      setZoom((currentZoom) => clamp(currentZoom + (event.deltaY < 0 ? 1 : -1), minZoom, maxZoom))
    }

    mapElement.addEventListener('wheel', handleWheel, { passive: false })

    return () => mapElement.removeEventListener('wheel', handleWheel)
  }, [])

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      onError('El navegador no permite obtener ubicacion.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCenter = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }
        setMapCenter(nextCenter)
        setZoom(Math.max(zoom, 15))
        onChange({
          latitude: formatCoordinate(nextCenter.latitude),
          longitude: formatCoordinate(nextCenter.longitude)
        })
      },
      () => onError('No se pudo obtener la ubicacion actual. Puedes seleccionar el punto en el mapa.'),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    )
  }

  return (
    <div className="cameraLocationPicker">
      <div className="cameraLocationHeader">
        <span>Ubicacion geografica</span>
        <div className="cameraLocationActions">
          <button className="secondaryButton compactButton" onClick={handleUseCurrentLocation} type="button">
            <LocateFixed size={16} />
            Usar GPS
          </button>
          <button className="secondaryButton compactIconButton" onClick={() => changeZoom(zoom + 1)} type="button" aria-label="Acercar mapa">
            <Plus size={16} />
          </button>
          <button className="secondaryButton compactIconButton" onClick={() => changeZoom(zoom - 1)} type="button" aria-label="Alejar mapa">
            <Minus size={16} />
          </button>
          <button className="secondaryButton compactButton" onClick={() => onChange({ latitude: '', longitude: '' })} type="button">
            <X size={16} />
            Limpiar
          </button>
        </div>
      </div>

      <div
        aria-label="Seleccionar ubicacion de la camara en el mapa"
        className="cameraMapPicker"
        onKeyDown={(event) => {
          if (event.key === '+' || event.key === '=') changeZoom(zoom + 1)
          if (event.key === '-' || event.key === '_') changeZoom(zoom - 1)
        }}
        onClick={handleMapClick}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerCancel}
        onPointerUp={handlePointerUp}
        ref={mapRef}
        role="button"
        tabIndex={0}
      >
        <div className="cameraMapFallback" aria-hidden="true">
          <span className="fallbackMapLabel">Ecuador continental</span>
          <span className="fallbackMapIsland">Galapagos</span>
          <span className="fallbackMapNorth">N</span>
        </div>
        <div className="cameraMapTiles" style={{ height: mapHeight, width: mapWidth }}>
          {tiles.map((tile) => (
            <img
              alt=""
              aria-hidden="true"
              className="cameraMapTile"
              draggable={false}
              key={`${tile.rawX}-${tile.y}`}
              src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
              style={{
                left: tile.rawX * tileSize - topLeftX,
                top: tile.y * tileSize - topLeftY
              }}
            />
          ))}
          {marker ? (
            <span
              aria-hidden="true"
              className="cameraMapMarker"
              style={{
                left: `${(marker.x / mapWidth) * 100}%`,
                top: `${(marker.y / mapHeight) * 100}%`
              }}
            >
              <MapPin size={26} />
            </span>
          ) : null}
        </div>
      </div>

      <div className="mapHint">Arrastra para mover, usa la rueda o +/- para zoom y haz clic para fijar la camara.</div>

      <div className="coordinateGrid">
        <label className="fieldGroup">
          <span>Latitud</span>
          <input
            inputMode="decimal"
            onChange={(event) => onChange({ latitude: event.target.value, longitude })}
            placeholder="-1.234567"
            value={latitude}
          />
        </label>
        <label className="fieldGroup">
          <span>Longitud</span>
          <input
            inputMode="decimal"
            onChange={(event) => onChange({ latitude, longitude: event.target.value })}
            placeholder="-78.123456"
            value={longitude}
          />
        </label>
      </div>
    </div>
  )
}
