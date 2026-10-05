'use client';

import { useId, useState } from 'react';
import type { ChartPoint } from '../../lib/chart-axis';
import { moneda } from '../../lib/format';
import { marginScale } from '../../lib/margin-chart';
import { firma, trazoDibujado } from './animacion';

const WIDTH = 1000;
const HEIGHT = 220;
const PADDING = 16;

function tickIndices(count: number, limit: number) {
  const visible = Math.min(count, limit);
  return new Set(
    Array.from({ length: visible }, (_, index) =>
      visible === 1 ? 0 : Math.round((index * (count - 1)) / (visible - 1)),
    ),
  );
}

export function MarginChart({
  data,
  title = 'Evolución del margen',
  subtitle = 'Ventas menos gastos',
}: {
  data: ChartPoint[];
  title?: string;
  subtitle?: string;
}) {
  const id = useId().replace(/:/g, '');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const scale = marginScale(data.map((row) => row.margin));
  const span = scale.max - scale.min;
  const x = (index: number) =>
    data.length <= 1 ? WIDTH / 2 : PADDING + (index / (data.length - 1)) * (WIDTH - PADDING * 2);
  const y = (value: number) => PADDING + ((scale.max - value) / span) * (HEIGHT - PADDING * 2);
  const zeroY = y(0);
  const points = data.map((row, index) => `${x(index)},${y(row.margin)}`).join(' ');
  const area = data.length ? `${x(0)},${zeroY} ${points} ${x(data.length - 1)},${zeroY}` : '';
  const allZero = data.every((row) => row.margin === 0);
  const desktopTicks = tickIndices(data.length, 6);
  const mobileTicks = tickIndices(data.length, 3);
  const activeIndex = data.findIndex((row) => row.key === activeKey);
  const selected = data[activeIndex];

  return (
    <section className="margin-chart-card" aria-labelledby={`${id}-title`}>
      <div className="margin-chart-head">
        <div>
          <h3 id={`${id}-title`}>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <div className="margin-chart-legend">
          <span className="margin-positive">Margen positivo</span>
          <span className="margin-negative">Margen negativo</span>
        </div>
      </div>
      {data.length ? (
        <div className="margin-chart-body">
          <div className="margin-chart-y" aria-label="Eje Y: margen en soles">
            <div className="margin-chart-y-measure" aria-hidden="true">
              {scale.ticks.map((value) => (
                <span key={value}>{moneda(value)}</span>
              ))}
            </div>
            {scale.ticks.map((value) => (
              <span
                key={value}
                className={value === 0 ? 'margin-chart-zero-label' : undefined}
                style={{ top: `${(y(value) / HEIGHT) * 100}%` }}
              >
                {moneda(value)}
              </span>
            ))}
          </div>
          <div className="margin-chart-plot" onMouseLeave={() => setActiveKey(null)}>
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Evolución del margen: positivo en verde y negativo en rojo"
              key={firma(data.map((row) => [row.key, row.margin]))}
            >
              <defs>
                <clipPath id={`${id}-positive`}>
                  <rect x="0" y="0" width={WIDTH} height={zeroY} />
                </clipPath>
                <clipPath id={`${id}-negative`}>
                  <rect x="0" y={zeroY} width={WIDTH} height={HEIGHT - zeroY} />
                </clipPath>
              </defs>
              {scale.ticks.map((value) => (
                <line
                  key={value}
                  className={value === 0 ? 'margin-chart-zero' : 'margin-chart-grid'}
                  x1="0"
                  x2={WIDTH}
                  y1={y(value)}
                  y2={y(value)}
                />
              ))}
              {data.length > 1 && !allZero ? (
                <>
                  {(['positive', 'negative'] as const).map((sign) => (
                    <g key={sign} className={`margin-${sign}`} clipPath={`url(#${id}-${sign})`}>
                      <polygon className="margin-chart-fill" points={area} />
                      <polyline
                        className={`margin-chart-line ${trazoDibujado}`}
                        points={points}
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  ))}
                </>
              ) : data.length > 1 ? (
                <polyline
                  className="margin-chart-line margin-neutral"
                  points={points}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {!allZero
                ? data.map((row, index) =>
                    index > 0 && row.margin === 0 && data[index - 1].margin === 0 ? (
                      <line
                        key={`zero-${row.key}`}
                        className="margin-chart-line margin-neutral"
                        x1={x(index - 1)}
                        x2={x(index)}
                        y1={zeroY}
                        y2={zeroY}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null,
                  )
                : null}
            </svg>
            {selected ? (
              <span
                className="margin-chart-cursor"
                style={{ left: `${(x(activeIndex) / WIDTH) * 100}%` }}
                aria-hidden="true"
              />
            ) : null}
            {data.map((row, index) => {
              const left = index === 0 ? 0 : (x(index - 1) + x(index)) / 2;
              const right = index === data.length - 1 ? WIDTH : (x(index) + x(index + 1)) / 2;
              const sign = row.margin > 0 ? 'positive' : row.margin < 0 ? 'negative' : 'neutral';
              return (
                <button
                  key={row.key}
                  type="button"
                  className={`margin-chart-point${selected?.key === row.key ? ' is-active' : ''}`}
                  style={{
                    left: `${(left / WIDTH) * 100}%`,
                    width: `${((right - left) / WIDTH) * 100}%`,
                  }}
                  aria-label={`${row.tooltip}: margen ${moneda(row.margin)}`}
                  onMouseEnter={() => setActiveKey(row.key)}
                  onFocus={() => setActiveKey(row.key)}
                  onBlur={() => setActiveKey(null)}
                  onClick={() => setActiveKey(row.key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setActiveKey(null);
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                    event.preventDefault();
                    const next = Math.max(
                      0,
                      Math.min(data.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)),
                    );
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>('.margin-chart-point')
                      [next]?.focus();
                  }}
                >
                  <span
                    className={`margin-chart-dot margin-${sign}`}
                    style={{
                      left: `${((x(index) - left) / (right - left)) * 100}%`,
                      top: `${(y(row.margin) / HEIGHT) * 100}%`,
                    }}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
            {selected ? (
              <div
                className="margin-chart-tooltip"
                role="status"
                style={{ left: `${Math.max(25, Math.min(75, (x(activeIndex) / WIDTH) * 100))}%` }}
              >
                <span>{selected.tooltip}</span>
                <strong
                  className={
                    selected.margin > 0
                      ? 'margin-positive'
                      : selected.margin < 0
                        ? 'margin-negative'
                        : 'margin-neutral'
                  }
                >
                  {moneda(selected.margin)}
                </strong>
              </div>
            ) : null}
            <div className="margin-chart-x" aria-label="Eje X: fechas del período">
              {data.map((row, index) =>
                desktopTicks.has(index) || mobileTicks.has(index) ? (
                  <span
                    key={row.key}
                    className={
                      !mobileTicks.has(index)
                        ? 'margin-tick-desktop'
                        : !desktopTicks.has(index)
                          ? 'margin-tick-mobile'
                          : undefined
                    }
                    style={{ left: `${(x(index) / WIDTH) * 100}%` }}
                  >
                    {row.labelTop ? <small>{row.labelTop}</small> : null}
                    {row.label}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="margin-chart-empty">No hay datos en el período seleccionado.</p>
      )}
    </section>
  );
}
