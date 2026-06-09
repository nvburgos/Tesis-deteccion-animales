import type { Language } from '@/lib/i18n'

export type Priority = 'Normal' | 'Alta prioridad' | 'Revision manual'

export type DetectionResultData = {
  species: string | null
  confidence: number
  priority: Priority
  coordinates?: [number, number, number, number] | null
  message?: string
  imagePath?: string
  location?: string
  createdAt?: string
}

export type RecentDetection = {
  id: number
  imagePath: string
  species: string
  confidence: number
  location: string
  priority: Priority
  createdAt: string
  time?: string
  userId?: number | null
  researcher?: string
  researcherEmail?: string | null
  x1?: number | null
  y1?: number | null
  x2?: number | null
  y2?: number | null
}

export type DashboardMetric = {
  label: string
  value: string
  detail: string
}

export type DashboardView = 'dashboard' | 'map' | 'species' | 'reports' | 'support'

export type { Language }
