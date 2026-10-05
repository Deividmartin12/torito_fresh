'use client';

import { BarChart3, CalendarClock, MapPinned } from 'lucide-react';
import { useMemo } from 'react';
import { AnalyticsRanking, HeatmapPoint } from '../../lib/analytics';
import { ChartPoint } from '../../lib/chart-axis';
import { moneda } from '../../lib/format';
import {
  aparece,
  barraHorizontal,
  barraVertical,
  firma,
  retraso,
} from './animacion';
import { ColumnTick, tickEvery } from './AxisTick';

export function ComparisonBarChart({
  data,
  title = 'Ventas vs gastos',
  subtitle = 'Importes registrados por mes',
}: {
  data: ChartPoint[];
  title?: string;
  subtitle?: string;
}) {
  const rows = data.slice(-32);
  const max = Math.max(1, ...rows.flatMap((row) => [row.sales, row.expenses]));
  const showValues = rows.length <= 8;
  // Con muchas columnas las etiquetas se encimarían, así que se escribe una de cada tantas.
  const labelEvery = tickEvery(rows.length, 16);
  return (
    <ChartCard
      icon={<BarChart3 size={18} />}
      title={title}
      subtitle={subtitle}
      legend={
        <>
          <span className="legend-sales">Ventas</span>
          <span className="legend-purchases">Gastos</span>
        </>
      }
    >
      {rows.length ? (
        <div
          className="comparison-chart-wrap"
          key={firma(rows.map((row) => [row.key, row.sales, row.expenses]))}
        >
          {/* Eje Y fijo como en Evolución: no se desplaza con el scroll horizontal. */}
          <div className="comparison-y-axis" aria-hidden="true">
            {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
              <span key={ratio} style={{ top: `${(1 - ratio) * 100}%` }}>
                {compactMoney(max * ratio)}
              </span>
            ))}
          </div>
          <div className={`comparison-chart${showValues ? ' comparison-chart-labeled' : ''}`}>
            <div className="comparison-chart-body">
              <div className="comparison-gridlines" aria-hidden="true">
                {[1, 0.75, 0.5, 0.25].map((ratio) => (
                  <span key={ratio} style={{ top: `${(1 - ratio) * 100}%` }} />
                ))}
              </div>
              {rows.map((row, index) => (
            <div className="comparison-column" key={row.key}>
              {showValues ? (
                <div className={`comparison-values ${aparece}`} style={retraso(index, 60, 900)}>
                  <span className="comparison-value-sales">{compactMoney(row.sales)}</span>
                  <span className="comparison-value-expenses">{compactMoney(row.expenses)}</span>
                </div>
              ) : null}
              <div className="comparison-bars">
                <span
                  className={`comparison-sales ${barraVertical}`}
                  style={{
                    height: `${Math.max(row.sales ? 4 : 0, (row.sales / max) * 100)}%`,
                    ...retraso(index),
                  }}
                  title={`${row.tooltip} · Ventas: ${moneda(row.sales)}`}
                />
                <span
                  className={`comparison-purchases ${barraVertical}`}
                  style={{
                    height: `${Math.max(row.expenses ? 4 : 0, (row.expenses / max) * 100)}%`,
                    ...retraso(index + 2),
                  }}
                  title={`${row.tooltip} · Gastos: ${moneda(row.expenses)}`}
                />
              </div>
              {index % labelEvery === 0 || index === rows.length - 1 ? (
                <ColumnTick label={row.label} labelTop={row.labelTop} />
              ) : (
                <small />
              )}
            </div>
          ))}
            </div>
          </div>
        </div>
      ) : (
        <ChartEmpty />
      )}
    </ChartCard>
  );
}

export function RankingBarChart({
  rows,
  title,
  subtitle,
  valueKind = 'moneda',
  icon = 'ranking',
  detail,
}: {
  rows: AnalyticsRanking[];
  title: string;
  subtitle: string;
  valueKind?: 'moneda' | 'count';
  icon?: 'ranking' | 'zone';
  detail?: (row: AnalyticsRanking) => string;
}) {
  const visible = rows.slice(0, 8);
  const max = Math.max(1, ...visible.map((row) => row.value));
  return (
    <ChartCard
      icon={icon === 'zone' ? <MapPinned size={18} /> : <BarChart3 size={18} />}
      title={title}
      subtitle={subtitle}
    >
      {visible.length ? (
        <div className="analytics-ranking" key={firma(visible.map((row) => [row.id, row.value]))}>
          {visible.map((row, index) => (
            <div key={`${row.id}-${row.name}`}>
              <div>
                <span title={row.name}>{row.name}</span>
                <strong>{valueKind === 'moneda' ? moneda(row.value) : row.value}</strong>
              </div>
              <div className="analytics-track">
                <span
                  className={barraHorizontal}
                  style={{
                    width: `${Math.max(3, (row.value / max) * 100)}%`,
                    ...retraso(index, 70),
                  }}
                />
              </div>
              <small>
                {detail
                  ? detail(row)
                  : `${row.count} ${row.count === 1 ? 'operación' : 'operaciones'}`}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <ChartEmpty />
      )}
    </ChartCard>
  );
}

export { MarginChart } from './MarginChart';

function compactMoney(value: number) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}S/${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${sign}S/${Math.round(abs)}`;
}

export function DemandHeatmap({ data }: { data: HeatmapPoint[] }) {
  const hours = useMemo(() => {
    const populated = [...new Set(data.map((point) => point.hour))].sort((a, b) => a - b);
    if (!populated.length) return [8, 10, 12, 14, 16, 18];
    const min = Math.max(0, Math.min(...populated));
    const max = Math.min(23, Math.max(...populated));
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }, [data]);
  // El color sigue al monto vendido: es lo que el negocio mira para saber qué hora rinde más.
  const max = Math.max(1, ...data.map((point) => point.sales));
  const days = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
  const byCell = new Map(data.map((point) => [`${point.day}-${point.hour}`, point]));
  return (
    <ChartCard
      icon={<CalendarClock size={18} />}
      title="Demanda por día y hora"
      subtitle="Monto vendido y cantidad de ventas por hora; más oscuro significa más monto"
    >
      <div
        className="demand-heatmap"
        style={{ gridTemplateColumns: `90px repeat(${hours.length}, minmax(52px, 1fr))` }}
        key={firma(data.map((point) => [point.day, point.hour, point.orders, point.sales]))}
      >
        <span />
        {hours.map((hour) => (
          <strong key={hour}>{`${String(hour).padStart(2, '0')}:00`}</strong>
        ))}
        {days.map((day, dayIndex) => (
          <HeatmapRow
            key={day}
            day={day}
            dayIndex={dayIndex}
            hours={hours}
            byCell={byCell}
            max={max}
          />
        ))}
      </div>
    </ChartCard>
  );
}

function HeatmapRow({
  day,
  dayIndex,
  hours,
  byCell,
  max,
}: {
  day: string;
  dayIndex: number;
  hours: number[];
  byCell: Map<string, HeatmapPoint>;
  max: number;
}) {
  return (
    <>
      <span>{day}</span>
      {hours.map((hour, hourIndex) => {
        const point = byCell.get(`${dayIndex}-${hour}`);
        const intensity = (point?.sales ?? 0) / max;
        return (
          <i
            key={hour}
            // Sobre los cuadros más oscuros el texto pasa a blanco para seguir leyéndose.
            className={`${aparece} ${intensity > 0.55 ? '!text-white' : ''}`}
            // Entra en diagonal: por día y por hora, como una ola.
            style={
              {
                '--heat': intensity,
                ...retraso(dayIndex * 2 + hourIndex, 25, 900),
              } as React.CSSProperties
            }
            title={`${day} ${hour}:00 · ${point?.orders ?? 0} ${point?.orders === 1 ? 'venta' : 'ventas'} · ${moneda(point?.sales ?? 0)}`}
          >
            {point?.orders ? (
              <>
                <b className="text-[10px] font-semibold leading-none tabular-nums">
                  {compactMoney(point.sales)}
                </b>
                <small className="text-[9px] leading-none opacity-80">
                  {point.orders} {point.orders === 1 ? 'venta' : 'ventas'}
                </small>
              </>
            ) : null}
          </i>
        );
      })}
    </>
  );
}

function ChartCard({
  icon,
  title,
  subtitle,
  legend,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  legend?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[17px] border border-line bg-surface p-[17px] [container-type:inline-size]">
      <div className="mb-[13px] flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-[35px] w-[35px] flex-none place-items-center rounded-[10px] bg-surface-soft text-accent">
            {icon}
          </span>
          <div>
            <h3 className="m-0 text-base text-fg">{title}</h3>
            <p className="m-0 mt-0.5 text-[11px] text-muted">{subtitle}</p>
          </div>
        </div>
        {action ?? (legend ? <div className="chart-legend">{legend}</div> : null)}
      </div>
      {children}
    </section>
  );
}

function ChartEmpty() {
  return (
    <div className="chart-empty">
      <BarChart3 size={26} />
      <span>Aún no hay datos suficientes para construir este gráfico.</span>
    </div>
  );
}
