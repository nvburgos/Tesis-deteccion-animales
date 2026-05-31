'use client'

import type { Priority, RecentDetection } from './dashboardTypes'

function PriorityBadge({ priority }: { priority: Priority }) {
  const className =
    priority === 'Alta prioridad'
      ? 'priorityPill priorityHigh'
      : priority === 'Revisión manual'
        ? 'priorityPill priorityReview'
        : 'priorityPill priorityNormal'

  return <span className={className}>{priority}</span>
}

function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`
}

export default function RecentDetections({ detections }: { detections: RecentDetection[] }) {
  return (
    <section className="detectionsPanel" aria-label="Detecciones recientes">
      <div className="panelHeader">
        <h2>Detecciones recientes</h2>
        <div className="panelActions">
          <button className="secondaryButton" type="button">
            Filtrar
          </button>
          <button className="secondaryButton" type="button">
            Exportar
          </button>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Imagen</th>
              <th>Especie detectada</th>
              <th>Cámara o ubicación</th>
              <th>Prioridad</th>
              <th>Fecha/hora</th>
              <th>Confianza</th>
            </tr>
          </thead>
          <tbody>
            {detections.length > 0 ? (
              detections.map((detection) => (
                <tr key={detection.id}>
                  <td>
                    <img
                      alt={`Imagen analizada: ${detection.species}`}
                      className="wildlifeImage"
                      src={detection.imagePath}
                    />
                  </td>
                  <td className="speciesCell">{detection.species}</td>
                  <td>{detection.location}</td>
                  <td>
                    <PriorityBadge priority={detection.priority} />
                  </td>
                  <td>
                    <time dateTime={detection.createdAt}>
                      {new Date(detection.createdAt).toLocaleString('es-ES', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </time>
                  </td>
                  <td className="confidenceCell">
                    <span>{formatConfidence(detection.confidence)}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="emptyState" colSpan={6}>
                  Aún no hay detecciones. Carga una imagen de cámara trampa para iniciar el análisis.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button className="historyButton" type="button">
        Ver todas las detecciones históricas
      </button>
    </section>
  )
}
