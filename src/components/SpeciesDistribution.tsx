'use client'

import { useMemo, useState } from 'react'
import { PawPrint } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { isValidSpecies } from '@/lib/detectionClassification'
import { getSpeciesLabel } from '@/lib/i18n'
import { getIdentificationLevel, type IdentificationLevel } from '@/lib/speciesTaxonomy'
import type { Language } from './dashboardTypes'
import type { SpeciesDistributionItem } from './BatchSummary'

const palette = [
  '#7ED9BA',
  '#A7D7A0',
  '#B8D3F2',
  '#F3DE91',
  '#C9D7E8',
  '#D8C6E8',
  '#DDE5DF',
  '#F2B8A2',
  '#A9DCCF',
  '#D5D9A8',
  '#BFD8B8',
  '#E6C7B8',
  '#B7C8E8',
  '#EAD7A7',
  '#C7E0D2'
]

const MAX_VISIBLE_SPECIES = 15

type ChartItem = {
  classificationLevel: IdentificationLevel
  classificationLabel: string
  color: string
  count: number
  name: string
  percent: number
  species: string
}

function getClassificationLabel(level: IdentificationLevel) {
  const labels: Record<IdentificationLevel, string> = {
    species: 'Especie',
    family: 'Familia',
    genus: 'Genero',
    general: 'Identificacion general',
    taxonomic_group: 'Grupo taxonomico',
    unclassified: 'Sin clasificar'
  }

  return labels[level]
}

function toPercent(count: number, total: number, fallback?: number) {
  if (typeof fallback === 'number') {
    return Number(fallback.toFixed(1))
  }

  return total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0
}

function buildChartItems(distribution: SpeciesDistributionItem[], language: Language): ChartItem[] {
  const validDistribution = distribution
    .filter((item) => item.count > 0 && isValidSpecies(item.species))
    .sort((left, right) => right.count - left.count || left.species.localeCompare(right.species))

  const total = validDistribution.reduce((sum, item) => sum + item.count, 0)

  return validDistribution.map((item, index) => {
    const classificationLevel = item.classificationLevel ?? getIdentificationLevel(item.species)

    return {
      classificationLevel,
      classificationLabel: getClassificationLabel(classificationLevel),
      color: palette[index % palette.length],
      count: item.count,
      name: getSpeciesLabel(item.species, language),
      percent: toPercent(item.count, total, item.percentage),
      species: item.species
    }
  })
}

function getDominantTitle(item?: ChartItem) {
  if (!item) return 'Especie predominante'
  return item.classificationLevel === 'species' ? 'Especie predominante' : 'Taxon predominante'
}

function SpeciesTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartItem }> }) {
  if (!active || !payload?.[0]) {
    return null
  }

  const item = payload[0].payload

  return (
    <div className="speciesChartTooltip">
      <strong>{item.name}</strong>
      <span>{item.count.toLocaleString('es-ES')} detecciones</span>
      <span>{item.percent}%</span>
      <small>{item.classificationLabel}</small>
    </div>
  )
}

export default function SpeciesDistribution({ distribution, language = 'es' }: { distribution: SpeciesDistributionItem[]; language?: Language }) {
  const [showAllSpecies, setShowAllSpecies] = useState(false)
  const chartItems = useMemo(() => buildChartItems(distribution, language), [distribution, language])
  const total = chartItems.reduce((sum, item) => sum + item.count, 0)
  const visibleItems = showAllSpecies ? chartItems : chartItems.slice(0, MAX_VISIBLE_SPECIES)
  const hiddenCount = Math.max(0, chartItems.length - visibleItems.length)
  const topSpecies = chartItems[0]
  const distinctSpecies = chartItems.length
  const shouldScroll = visibleItems.length > 10

  return (
    <section className="speciesDistributionPanel speciesAnalyticsPanel" aria-label="Especies detectadas en el lote">
      <div className="panelHeader speciesAnalyticsHeader">
        <div>
          <h2>Especies detectadas en el lote</h2>
          <p>Distribucion porcentual de las especies identificadas durante el procesamiento del lote.</p>
        </div>
      </div>

      {chartItems.length > 0 && total > 0 ? (
        <div className="speciesAnalyticsBody">
          <div className="speciesAnalyticsLeft">
            <div className="speciesDominantSummary">
              <span>{getDominantTitle(topSpecies)}</span>
              <strong>{topSpecies.name}</strong>
              <em>{topSpecies.percent}%</em>
            </div>
            <div className="speciesDonutWrap" aria-label={`Grafico de dona con ${visibleItems.length} taxones visibles de ${distinctSpecies} detectados`}>
              <ResponsiveContainer height={260} width="100%">
                <PieChart>
                  <Tooltip content={<SpeciesTooltip />} />
                  <Pie
                    animationDuration={650}
                    data={visibleItems}
                    dataKey="count"
                    innerRadius="62%"
                    outerRadius="84%"
                    paddingAngle={2}
                    stroke="#ffffff"
                    strokeWidth={4}
                  >
                    {visibleItems.map((item) => (
                      <Cell fill={item.color} key={item.species} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="speciesDonutCenter" aria-hidden="true">
                <span>Taxones detectados</span>
                <strong>{distinctSpecies.toLocaleString('es-ES')}</strong>
              </div>
            </div>
          </div>

          <div className={`speciesAnalyticsList${shouldScroll ? ' speciesAnalyticsListScrollable' : ''}`} aria-label="Listado de especies detectadas">
            {visibleItems.map((item) => (
              <div className="speciesAnalyticsRow" key={item.species}>
                <div className="speciesAnalyticsMeta">
                  <span className="speciesColorDot" style={{ background: item.color }} />
                  <strong>{item.name}</strong>
                  <span>{item.count.toLocaleString('es-ES')} {item.count === 1 ? 'deteccion' : 'detecciones'}</span>
                  <em>{item.percent}%</em>
                </div>
                <span className="speciesClassificationLevel">{item.classificationLabel}</span>
                <div className="speciesThinBar" aria-hidden="true">
                  <span style={{ background: item.color, width: `${Math.min(100, item.percent)}%` }} />
                </div>
              </div>
            ))}
            {hiddenCount > 0 ? (
              <button className="speciesExpandButton" type="button" onClick={() => setShowAllSpecies(true)}>
                Ver las {hiddenCount.toLocaleString('es-ES')} especies restantes
              </button>
            ) : null}
            {showAllSpecies && chartItems.length > MAX_VISIBLE_SPECIES ? (
              <button className="speciesExpandButton" type="button" onClick={() => setShowAllSpecies(false)}>
                Ver solo las {MAX_VISIBLE_SPECIES} mas frecuentes
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="emptyState speciesAnalyticsEmpty">
          <PawPrint size={26} />
          No se detectaron especies en este lote.
        </div>
      )}
    </section>
  )
}