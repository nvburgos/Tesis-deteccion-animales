import { ChartNoAxesColumn, Goal, Microscope, type LucideIcon } from 'lucide-react'

export type DetectionStatus = 'Alta prioridad' | 'Normal'

export type Detection = {
  id: number
  species: string
  confidence: number
  camera: string
  location: string
  status: DetectionStatus
  time: string
  imageTone: 'jaguar' | 'deer' | 'tapir'
}

export type Metric = {
  label: string
  value: string
  detail: string
  icon: LucideIcon
}

export const metrics: Metric[] = [
  {
    label: 'Imagenes analizadas',
    value: '12.450',
    detail: '+12% respecto a ayer',
    icon: ChartNoAxesColumn
  },
  { label: 'Especies', value: '23', detail: 'Diversidad estable', icon: Microscope },
  { label: 'Confianza', value: '94%', detail: 'Precision del modelo YOLO v8', icon: Goal }
]

export const detections: Detection[] = [
  {
    id: 1,
    species: 'Jaguar',
    confidence: 96,
    camera: 'Camara 01',
    location: 'Zona Norte',
    status: 'Alta prioridad',
    time: 'Hace 8 min',
    imageTone: 'jaguar'
  },
  {
    id: 2,
    species: 'Venado Cola Blanca',
    confidence: 92,
    camera: 'Camara 04',
    location: 'Sendero Este',
    status: 'Normal',
    time: 'Hace 24 min',
    imageTone: 'deer'
  },
  {
    id: 3,
    species: 'Tapir Amazonico',
    confidence: 89,
    camera: 'Camara 07',
    location: 'Humedal Central',
    status: 'Normal',
    time: 'Hace 1 hora',
    imageTone: 'tapir'
  }
]
