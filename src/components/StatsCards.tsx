'use client'

import { ChartNoAxesColumn, Goal, Microscope, ScanSearch, type LucideIcon } from 'lucide-react'
import type { DashboardMetric } from './dashboardTypes'

const metricIcons: Record<string, LucideIcon> = {
  'Imagenes analizadas': ChartNoAxesColumn,
  'Total de imagenes analizadas': ChartNoAxesColumn,
  'Total de detecciones': ScanSearch,
  'Especies detectadas': Microscope,
  'Confianza promedio': Goal
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

export default function StatsCards({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <section className="metricsGrid" aria-label="Metricas principales">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} metric={metric} />
      ))}
    </section>
  )
}
