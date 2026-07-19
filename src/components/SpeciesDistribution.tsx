'use client'

import { getSpeciesLabel } from '@/lib/i18n'
import type { Language } from './dashboardTypes'
import type { SpeciesDistributionItem } from './BatchSummary'

export default function SpeciesDistribution({ distribution, language = 'es' }: { distribution: SpeciesDistributionItem[]; language?: Language }) {
  const total = distribution.reduce((sum, item) => sum + item.count, 0)

  return (
    <section className="speciesDistributionPanel" aria-label="Especies detectadas en el lote">
      <div className="panelHeader">
        <h2>Especies detectadas en el lote</h2>
      </div>

      {distribution.length > 0 ? (
        <div className="speciesDistributionList">
          {distribution.map((item) => {
            const percent = total > 0 ? Math.round((item.count / total) * 100) : 0

            return (
              <div className="speciesDistributionRow" key={item.species}>
                <div>
                  <strong>{getSpeciesLabel(item.species, language)}</strong>
                  <span>{item.count.toLocaleString('es-ES')} apariciones · {percent}%</span>
                </div>
                <div className="speciesBarTrack" aria-hidden="true">
                  <span style={{ width: `${percent}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="emptyState">No hay especies detectadas en el lote seleccionado.</div>
      )}
    </section>
  )
}
