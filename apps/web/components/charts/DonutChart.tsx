'use client';

import { AnalyticsRanking } from '../../lib/analytics';
import { moneda } from '../../lib/format';
import { aparece, entraGirando, firma, retraso } from './animacion';

const RADIO = 45;
const GROSOR = 15;
const PERIMETRO = 2 * Math.PI * RADIO;

// Se reutilizan los colores de los demás gráficos y se completan con los de estado, para que
// una categoría tenga el mismo color acá y en el resto del panel.
const COLORES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-4)',
  'var(--status-amber-text)',
  'var(--chart-3)',
  'var(--status-red-text)',
];

/**
 * Dona de desglose con su leyenda al lado. Se dibujan **todas** las categorías que llegan, sin
 * agruparlas en un "Otros": el backend ya manda las diez principales y perder el nombre de una
 * categoría es justo lo que hace inútil el desglose.
 */
export function DonutChart({
  rows,
  centerLabel,
}: {
  rows: AnalyticsRanking[];
  centerLabel: string;
}) {
  const total = rows.reduce((suma, fila) => suma + fila.value, 0);
  if (!total) return <div className="entity-list-empty">No hay movimientos en el período.</div>;

  let acumulado = 0;
  return (
    <div className="donut-breakdown" key={firma(rows.map((fila) => [fila.id, fila.value]))}>
      <svg
        className={entraGirando}
        viewBox="0 0 120 120"
        role="img"
        aria-label={`${centerLabel}: ${moneda(total)}`}
      >
        {rows.map((fila, indice) => {
          const porcion = (fila.value / total) * PERIMETRO;
          // El arco empieza arriba (de ahí el giro de 90°) y cada uno arranca donde terminó
          // el anterior, desplazando el patrón del trazo.
          const desplazamiento = -acumulado;
          acumulado += porcion;
          return (
            <circle
              key={fila.id}
              cx="60"
              cy="60"
              r={RADIO}
              fill="none"
              stroke={COLORES[indice % COLORES.length]}
              strokeWidth={GROSOR}
              strokeDasharray={`${porcion} ${PERIMETRO - porcion}`}
              strokeDashoffset={desplazamiento}
              transform="rotate(-90 60 60)"
            />
          );
        })}
        <text className="donut-center-value" x="60" y="59" textAnchor="middle">
          {moneda(total)}
        </text>
        <text className="donut-center-label" x="60" y="72" textAnchor="middle">
          {centerLabel}
        </text>
      </svg>
      <div className="donut-legend">
        {rows.map((fila, indice) => (
          <div className={`donut-legend-row ${aparece}`} key={fila.id} style={retraso(indice, 60)}>
            <span
              className="donut-legend-dot"
              style={{ background: COLORES[indice % COLORES.length] }}
            />
            <span className="donut-legend-name">{fila.name}</span>
            <span className="donut-legend-value">{moneda(fila.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
