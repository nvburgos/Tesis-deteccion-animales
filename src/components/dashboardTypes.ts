export type Priority = 'Normal' | 'Alta prioridad' | 'Revisión manual'

export type DetectionResultData = {
  species: string | null
  confidence: number
  priority: Priority
  message?: string
}

export type RecentDetection = {
  id: number
  imagePath: string
  species: string
  confidence: number
  location: string
  priority: Priority
  createdAt: string
}

export type DashboardMetric = {
  label: string
  value: string
  detail: string
}
