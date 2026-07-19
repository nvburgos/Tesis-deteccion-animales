'use client'

import { PawPrint } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { getSpeciesLabel } from '@/lib/i18n'
import type { Language } from './dashboardTypes'
import type { SpeciesDistributionItem } from './BatchSummary'

const palette = ['#7ED9BA', '#A7D7A0', '#B8D3F2', '#F3DE91', '#C9D7E8', '#D8C6E8', '#DDE5DF']

type ChartItem = {
  color: string
  count: number
  groupedSpecies?: string[]
  name: string
  percent: number
  species: string
}

function buildChartItems(distribution: SpeciesDistributionItem[], language: Language): ChartItem[] {
  const total = distribution.reduce((sum, item) => sum + item.count, 0)
  const sorted = [...distribution].sort((left, right) => right.count - left.count)
  const visible = sorted.length > 6 ? sorted.slice(0, 5) : sorted.slice(0, 6)
  const hidden = sorted.length > 6 ? sorted.slice(5) : []
  const items: ChartItem[] = visible.map((item, index) => ({
    color: palette[index % palette.length],
    count: item.count,
    name: getSpeciesLabel(item.species, language),
    percent: total > 0 ? Math.round((item.count / total) * 100) : 0,
    species: item.species
  }))

  if (hidden.length > 0) {
    const hiddenCount = hidden.reduce((sum, item) => sum + item.count, 0)
    items.push({
      color: palette[5],
      count: hiddenCount,
      groupedSpecies: hidden.map((item) => getSpeciesLabel(item.species, language)),
      name: 'Otras',
      percent: total > 0 ? Math.round((hiddenCount / total) * 100) : 0,
      species: 'Otras'
    })
  }

  return items
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
      {item.groupedSpecies ? <small>{item.groupedSpecies.join(', ')}</small> : null}
    </div>
  )
}

export default function SpeciesDistribution({ distribution, language = 'es' }: { distribution: SpeciesDistributionItem[]; language?: Language }) {
  const total = distribution.reduce((sum, item) => sum + item.count, 0)
  const chartItems = buildChartItems(distribution, language)
  const topSpecies = chartItems[0]
  const distinctSpecies = distribution.length
  return (
    <section className="speciesDistributionPanel speciesAnalyticsPanel" aria-label="Especies detectadas en el lote">
      <div className="panelHeader speciesAnalyticsHeader">
        <div>
          <h2>Especies detectadas en el lote</h2>
          <p>Distribucion porcentual de las especies identificadas durante el procesamiento del lote.</p>
        </div>
      </div>

      {distribution.length > 0 && total > 0 ? (
        <div className="speciesAnalyticsBody">
          <div className="speciesAnalyticsLeft">
            <div className="speciesDominantSummary">
              <span>Especie predominante</span>
              <strong>{topSpecies.name}</strong>
              <em>{topSpecies.percent}%</em>
            </div>
            <div className="speciesDonutWrap" aria-label={`Grafico de dona con ${distinctSpecies} especies detectadas`}>
              <ResponsiveContainer height={260} width="100%">
                <PieChart>
                  <Tooltip content={<SpeciesTooltip />} />
                  <Pie
                    animationDuration={650}
                    data={chartItems}
                    dataKey="count"
                    innerRadius="62%"
                    outerRadius="84%"
                    paddingAngle={2}
                    stroke="#ffffff"
                    strokeWidth={4}
                  >
                    {chartItems.map((item) => (
                      <Cell fill={item.color} key={item.species} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="speciesDonutCenter" aria-hidden="true">
                <span>Especies detectadas</span>
                <strong>{distinctSpecies.toLocaleString('es-ES')}</strong>
              </div>
            </div>
          </div>

          <div className="speciesAnalyticsList" aria-label="Listado de especies detectadas">
            {chartItems.map((item) => (
              <div className="speciesAnalyticsRow" key={item.species} title={item.groupedSpecies ? `Incluye: ${item.groupedSpecies.join(', ')}` : undefined}>
                <div className="speciesAnalyticsMeta">
                  <span className="speciesColorDot" style={{ background: item.color }} />
                  <strong>{item.name}</strong>
                  <span>{item.count.toLocaleString('es-ES')} detecciones</span>
                  <em>{item.percent}%</em>
                </div>
                <div className="speciesThinBar" aria-hidden="true">
                  <span style={{ background: item.color, width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
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
