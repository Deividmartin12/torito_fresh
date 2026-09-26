'use client';

import { BarChart3, CalendarClock, MapPinned, TrendingUp } from 'lucide-react';
import { useId, useMemo } from 'react';
import { AnalyticsRanking, HeatmapPoint } from '../../lib/analytics';
import { ChartPoint } from '../../lib/chart-axis';
import { moneda } from '../../lib/format';
import {
  aparece,
  barraHorizontal,
  barraVertical,
  firma,
  retraso,
  trazoDibujado,
} from './animacion';
import { AxisTick, ColumnTick, tickEvery } from './AxisTick';

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
          className={`comparison-chart${showValues ? ' comparison-chart-labeled' : ''}`}
          key={firma(rows.map((row) => [row.key, row.sales, row.expenses]))}
        >
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

export function MarginChart({
  data,
  title = 'Evolución del margen',
  subtitle = 'Venta sin IGV menos costo de inventario',
}: {
  data: ChartPoint[];
  title?: string;
  subtitle?: string;
}) {
  const gradientId = useId().replace(/:/g, '');
  const rows = data.slice(-32);
  const width = 680;
  const height = 230;
  // El fondo deja sitio para las dos líneas de la marca de eje (nombre del día + fecha).
  const padding = { top: 22, right: 14, bottom: 46, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = rows.map((row) => row.margin);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const x = (index: number) =>
    padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const y = (value: number) => padding.top + chartHeight - ((value - min) / span) * chartHeight;
  const zeroY = y(0);
  const linePoints = rows.map((row, index) => `${x(index)},${y(row.margin)}`).join(' ');
  const areaPoints = rows.length
    ? `${x(0)},${zeroY} ${linePoints} ${x(rows.length - 1)},${zeroY}`
    : '';
  const labelEvery = tickEvery(rows.length);

  return (
    <ChartCard icon={<TrendingUp size={18} />} title={title} subtitle={subtitle}>
      {rows.length ? (
        <div className="line-chart-wrap">
          <svg
            className="line-chart margin-area-chart"
            key={firma(rows.map((row) => [row.key, row.margin]))}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Gráfico de evolución del margen"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity=".22" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const gridY = padding.top + chartHeight * ratio;
              const value = max - span * ratio;
              return (
                <g key={ratio}>
                  <line
                    className="chart-grid-line"
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={gridY}
                    y2={gridY}
                  />
                  <text
                    className="chart-axis-label"
                    x={padding.left - 9}
                    y={gridY + 4}
                    textAnchor="end"
                  >
                    {compactMoney(value)}
                  </text>
                </g>
              );
            })}
            {min < 0 && max > 0 ? (
              <line
                className="chart-zero-line"
                x1={padding.left}
                x2={width - padding.right}
                y1={zeroY}
                y2={zeroY}
              />
            ) : null}
            <polygon
              className={`chart-area margin-area-fill ${aparece}`}
              style={{ animationDelay: '600ms' }}
              points={areaPoints}
              fill={`url(#${gradientId})`}
            />
            <polyline
              className={`chart-line margin-area-line ${trazoDibujado}`}
              points={linePoints}
            />
            {rows.map((row, index) => (
              <g key={row.key}>
                <circle
                  className={`chart-dot margin-area-dot${row.margin < 0 ? ' negative' : ''} ${aparece}`}
                  style={retraso(rows.length > 1 ? (index / (rows.length - 1)) * 1000 : 0, 1, 1100)}
                  cx={x(index)}
                  cy={y(row.margin)}
                  r="4"
                >
                  <title>{`${row.tooltip}: ${moneda(row.margin)}`}</title>
                </circle>
                {index % labelEvery === 0 || index === rows.length - 1 ? (
                  <AxisTick
                    x={x(index)}
                    y={height - 14}
                    label={row.label}
                    labelTop={row.labelTop}
                  />
                ) : null}
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <ChartEmpty />
      )}
    </ChartCard>
  );
}

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
