'use client';

import { useState } from 'react';
import type { ChartPoint } from '../../lib/chart-axis';
import { moneda } from '../../lib/format';
import { aparece, firma, trazoDibujado } from '../charts/animacion';
import { tickIndices } from '../charts/AxisTick';
import { ChartExpansion } from '../charts/ChartExpansion';

const HEIGHT = 200;
const WIDTH = 1000;

/** Curvas sin sobrepasar los valores de cada tramo, como en la tarjeta de ventas. */
function curve(points: [number, number][]) {
  if (!points.length) return '';
  return points.slice(1).reduce((path, [x, y], index) => {
    const [previousX, previousY] = points[index];
    const middle = (previousX + x) / 2;
    return `${path} C ${middle} ${previousY}, ${middle} ${y}, ${x} ${y}`;
  }, `M ${points[0][0]} ${points[0][1]}`);
}

/** Escala compartida, desde cero, con cuatro intervalos legibles en soles. */
function scaleMaximum(value: number) {
  const target = Math.max(value, 1) / 4;
  const power = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * power >= target) ?? 10;
  return step * power * 4;
}

export function SalesExpensesChart({ data, title }: { data: ChartPoint[]; title: string }) {
  const plot = <SalesExpensesPlot data={data} />;
  const legend = (
    <div className="sales-expenses-legends">
      <span className="sales-expenses-legend sales-series">Ventas</span>
      <span className="sales-expenses-legend expenses-series">Gastos</span>
    </div>
  );

  return (
    <section className="sales-expenses-card" aria-label={title}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="sales-expenses-title">{title}</h2>
        <ChartExpansion title={title} legend={legend}>
          {plot}
        </ChartExpansion>
      </div>
      {legend}
      {plot}
    </section>
  );
}

function SalesExpensesPlot({ data }: { data: ChartPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = scaleMaximum(Math.max(0, ...data.flatMap((row) => [row.sales, row.expenses])));
  const percent = (index: number) => (data.length <= 1 ? 50 : (index / (data.length - 1)) * 100);
  const points = (field: 'sales' | 'expenses'): [number, number][] =>
    data.map((row, index) => [
      (percent(index) * WIDTH) / 100,
      HEIGHT - (row[field] / max) * HEIGHT,
    ]);
  const salesPoints = points('sales');
  const expensePoints = points('expenses');
  const salesPath = curve(salesPoints);
  const expensesPath = curve(expensePoints);
  const desktopTicks = tickIndices(data.length, 6);
  const mobileTicks = tickIndices(data.length, 3);
  const amounts = [1, 0.75, 0.5, 0.25, 0].map((ratio) => moneda(max * ratio));
  const selected = active == null ? null : data[active];

  return (
    <div className="sales-expenses-chart">
      <div className="sales-expenses-y" aria-label="Eje Y: importes en soles">
        <div className="sales-expenses-y-measure" aria-hidden="true">
          {amounts.map((amount, index) => (
            <span key={index}>{amount}</span>
          ))}
        </div>
        {amounts.map((amount, index) => (
          <span key={index} style={{ top: `${index * 25}%` }}>
            {amount}
          </span>
        ))}
      </div>
      <div className="sales-expenses-plot" onMouseLeave={() => setActive(null)}>
        <svg
          key={firma(data.map((row) => [row.key, row.sales, row.expenses]))}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Ventas en azul y gastos en gris, con la misma escala de importes"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              className="sales-expenses-grid"
              x1="0"
              x2={WIDTH}
              y1={HEIGHT * ratio}
              y2={HEIGHT * ratio}
            />
          ))}
          {data.length > 1 ? (
            <>
              <path
                d={`${salesPath} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`}
                className={`sales-expenses-fill sales-series ${aparece}`}
              />
              <path
                d={`${expensesPath} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`}
                className={`sales-expenses-fill expenses-series ${aparece}`}
              />
              <path
                d={salesPath}
                className={`sales-expenses-line sales-series ${trazoDibujado}`}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={expensesPath}
                className={`sales-expenses-line expenses-series ${trazoDibujado}`}
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
          {data.length === 1 ? (
            <>
              <circle
                className={`sales-series ${aparece}`}
                cx={salesPoints[0][0]}
                cy={salesPoints[0][1]}
                r="4"
                fill="currentColor"
              />
              <circle
                className={`expenses-series ${aparece}`}
                cx={expensePoints[0][0]}
                cy={expensePoints[0][1]}
                r="4"
                fill="currentColor"
              />
            </>
          ) : null}
        </svg>
        {data.map((row, index) => (
          <button
            type="button"
            key={row.key}
            className="sales-expenses-point"
            style={{ left: `${percent(index)}%`, width: `${100 / Math.max(data.length, 1)}%` }}
            aria-label={`${row.tooltip}: ventas ${moneda(row.sales)}, gastos ${moneda(row.expenses)}`}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setActive(null);
            }}
          />
        ))}
        {selected && active != null ? (
          <div
            className="sales-expenses-tooltip"
            role="status"
            style={{ left: `${Math.max(20, Math.min(80, percent(active)))}%` }}
          >
            <b>{selected.tooltip}</b>
            <span className="sales-series">Ventas: {moneda(selected.sales)}</span>
            <span className="expenses-series">Gastos: {moneda(selected.expenses)}</span>
          </div>
        ) : null}
        <div className="sales-expenses-x" aria-label="Eje X: fechas del período">
          {data.map((row, index) =>
            desktopTicks.has(index) || mobileTicks.has(index) ? (
              <span
                key={row.key}
                className={
                  !mobileTicks.has(index)
                    ? 'sales-expenses-tick-desktop'
                    : !desktopTicks.has(index)
                      ? 'sales-expenses-tick-mobile'
                      : undefined
                }
                style={{ left: `${percent(index)}%` }}
              >
                {row.labelTop ? <small>{row.labelTop}</small> : null}
                {row.label}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
