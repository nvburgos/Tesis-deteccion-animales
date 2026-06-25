'use client'

import { ChartNoAxesColumn, Goal, Microscope, ScanSearch, type LucideIcon } from 'lucide-react'
import { uiText, type UiText } from '@/lib/i18n'
import type { DashboardMetric } from './dashboardTypes'

const metricIcons: Record<string, LucideIcon> = {
  'Imagenes analizadas': ChartNoAxesColumn,
  'Total de imagenes analizadas': ChartNoAxesColumn,
  'Analyzed images': ChartNoAxesColumn,
  'Total analyzed images': ChartNoAxesColumn,
  'Total de detecciones': ScanSearch,
  'Total detections': ScanSearch,
  'Especies detectadas': Microscope,
  'Detected species': Microscope,
  'Confianza promedio': Goal,
  'Average confidence': Goal
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  const Icon = metricIcons[metric.label] ?? ChartNoAxesColumn

  return (
    <article className="metricCard">
      <div className="metricHeading">
        <span>{metric.label}</span>
        <span className="metricIcon">
          <Icon size={23} />
        </span>
      </div>
      <strong>{metric.value}</strong>
      <small>{metric.detail}</small>
    </article>
  )
}

export default function StatsCards({ metrics, text = uiText.es }: { metrics: DashboardMetric[]; text?: UiText }) {
  return (
    <section className="metricsGrid" aria-label={text.mainMetrics}>
      {metrics.map((metric) => (
        <MetricCard key={metric.label} metric={metric} />
      ))}
    </section>
  )
}
