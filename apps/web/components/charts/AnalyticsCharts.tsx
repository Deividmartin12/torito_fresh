'use client';

import { BarChart3, CalendarClock, MapPinned, TrendingUp } from 'lucide-react';
import { useId, useMemo } from 'react';
import { AnalyticsPeriod, AnalyticsRanking, HeatmapPoint } from '../../lib/analytics';
import { moneda } from '../../lib/format';

export function ComparisonBarChart({
  data,
  title = 'Ventas vs gastos',
  subtitle = 'Importes registrados por mes',
}: {
  data: AnalyticsPeriod[];
  title?: string;
  subtitle?: string;
}) {
  const rows = data.slice(-31);
  const max = Math.max(1, ...rows.flatMap((row) => [row.sales, row.expenses]));
  const showValues = rows.length <= 8;
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
        <div className={`comparison-chart${showValues ? ' comparison-chart-labeled' : ''}`}>
          {rows.map((row) => (
            <div className="comparison-column" key={row.key}>
              {showValues ? (
                <div className="comparison-values">
                  <span className="comparison-value-sales">{compactMoney(row.sales)}</span>
                  <span className="comparison-value-expenses">{compactMoney(row.expenses)}</span>
                </div>
              ) : null}
              <div className="comparison-bars">
                <span
                  className="comparison-sales"
                  style={{ height: `${Math.max(row.sales ? 4 : 0, (row.sales / max) * 100)}%` }}
                  title={`Ventas: ${moneda(row.sales)}`}
                />
                <span
                  className="comparison-purchases"
                  style={{
                    height: `${Math.max(row.expenses ? 4 : 0, (row.expenses / max) * 100)}%`,
                  }}
                  title={`Gastos: ${moneda(row.expenses)}`}
                />
              </div>
              <small>{row.label}</small>
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
        <div className="analytics-ranking">
          {visible.map((row) => (
            <div key={`${row.id}-${row.name}`}>
              <div>
                <span title={row.name}>{row.name}</span>
                <strong>{valueKind === 'moneda' ? moneda(row.value) : row.value}</strong>
              </div>
              <div className="analytics-track">
                <span style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} />
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
  subtitle = 'Venta sin IGV menos costo de inventario',
}: {
  data: AnalyticsPeriod[];
  subtitle?: string;
}) {
  const gradientId = useId().replace(/:/g, '');
  const rows = data.slice(-31);
  const width = 680;
  const height = 230;
  const padding = { top: 22, right: 14, bottom: 34, left: 58 };
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
  const labelEvery = Math.max(1, Math.ceil(rows.length / 6));

  return (
    <ChartCard icon={<TrendingUp size={18} />} title="Evolución del margen" subtitle={subtitle}>
      {rows.length ? (
        <div className="line-chart-wrap">
          <svg
            className="line-chart margin-area-chart"
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
              className="chart-area margin-area-fill"
              points={areaPoints}
              fill={`url(#${gradientId})`}
            />
            <polyline className="chart-line margin-area-line" points={linePoints} />
            {rows.map((row, index) => (
              <g key={row.key}>
                <circle
                  className={`chart-dot margin-area-dot${row.margin < 0 ? ' negative' : ''}`}
                  cx={x(index)}
                  cy={y(row.margin)}
                  r="4"
                >
                  <title>{`${row.label}: ${moneda(row.margin)}`}</title>
                </circle>
                {index % labelEvery === 0 || index === rows.length - 1 ? (
                  <text
                    className="chart-date-label"
                    x={x(index)}
                    y={height - 14}
                    textAnchor="middle"
                  >
                    {row.label}
                  </text>
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
  const max = Math.max(1, ...data.map((point) => point.orders));
  const days = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
  const byCell = new Map(data.map((point) => [`${point.day}-${point.hour}`, point]));
  return (
    <ChartCard
      icon={<CalendarClock size={18} />}
      title="Demanda por día y hora"
      subtitle="Cantidad de ventas confirmadas; más oscuro significa más demanda"
    >
      <div
        className="demand-heatmap"
        style={{ gridTemplateColumns: `90px repeat(${hours.length}, minmax(32px, 1fr))` }}
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
      {hours.map((hour) => {
        const point = byCell.get(`${dayIndex}-${hour}`);
        const intensity = (point?.orders ?? 0) / max;
        return (
          <i
            key={hour}
            style={{ '--heat': intensity } as React.CSSProperties}
            title={`${day} ${hour}:00 · ${point?.orders ?? 0} ventas · ${moneda(point?.sales ?? 0)}`}
          >
            {point?.orders || ''}
          </i>
        );
      })}
    </>
  );
}

export function MixAndPaymentsChart({
  customerMix,
  payments,
}: {
  customerMix: { new: number; recurring: number };
  payments: { name: string; value: number }[];
}) {
  const totalMix = customerMix.new + customerMix.recurring;
  const paymentTotal = payments.reduce((sum, item) => sum + item.value, 0);
  return (
    <ChartCard
      icon={<BarChart3 size={18} />}
      title="Fidelización y métodos de pago"
      subtitle="Participación de clientes y composición de cobros"
    >
      <div className="mix-section">
        <div className="mix-title">
          <span>Nuevo vs recurrente</span>
          <strong>
            {totalMix
              ? `${Math.round((customerMix.recurring / totalMix) * 100)}% recurrente`
              : 'Sin datos'}
          </strong>
        </div>
        <div className="mix-stack">
          <span style={{ width: `${totalMix ? (customerMix.new / totalMix) * 100 : 0}%` }} />
          <i style={{ width: `${totalMix ? (customerMix.recurring / totalMix) * 100 : 0}%` }} />
        </div>
        <div className="mix-legend">
          <span>Nuevos {moneda(customerMix.new)}</span>
          <span>Recurrentes {moneda(customerMix.recurring)}</span>
        </div>
      </div>
      <div className="payment-bars">
        {payments.map((item) => (
          <div key={item.name}>
            <span>{item.name}</span>
            <div>
              <i style={{ width: `${paymentTotal ? (item.value / paymentTotal) * 100 : 0}%` }} />
            </div>
            <strong>{moneda(item.value)}</strong>
          </div>
        ))}
      </div>
    </ChartCard>
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
    <section className="business-chart-card">
      <div className="chart-card-head">
        <div>
          <span className="chart-card-icon">{icon}</span>
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
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
