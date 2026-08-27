import { BarChart3, TrendingUp } from 'lucide-react';
import { useId } from 'react';
import { SalesPeriodRow, TopProductRow } from '../../lib/dashboard';
import { money, shortDate } from '../../lib/format';

export function SalesTrendChart({
  data,
  compact = false,
  title = 'Tendencia de ventas',
  subtitle = 'Facturado frente a cobrado por día',
  primaryLabel = 'Ventas',
  secondaryLabel = 'Cobrado',
  showSecondary = true,
}: {
  data: SalesPeriodRow[];
  compact?: boolean;
  title?: string;
  subtitle?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  showSecondary?: boolean;
}) {
  const gradientId = useId().replace(/:/g, '');
  const rows = data.slice(compact ? -10 : -18);
  const width = 720;
  const height = compact ? 230 : 270;
  const padding = { top: 25, right: 18, bottom: 42, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...rows.flatMap((row) => [Number(row.total), Number(row.paid)]));
  const x = (index: number) =>
    padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const y = (value: number) => padding.top + chartHeight - (value / max) * chartHeight;
  const totalPoints = rows.map((row, index) => `${x(index)},${y(Number(row.total))}`).join(' ');
  const paidPoints = rows.map((row, index) => `${x(index)},${y(Number(row.paid))}`).join(' ');
  const areaPoints = rows.length
    ? `${padding.left},${padding.top + chartHeight} ${totalPoints} ${x(rows.length - 1)},${padding.top + chartHeight}`
    : '';
  const labelEvery = Math.max(1, Math.ceil(rows.length / 5));

  return (
    <section className="business-chart-card" aria-labelledby={`${gradientId}-title`}>
      <div className="chart-card-head">
        <div>
          <span className="chart-card-icon">
            <TrendingUp size={18} />
          </span>
          <div>
            <h3 id={`${gradientId}-title`}>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="chart-legend">
          <span className="legend-total">{primaryLabel}</span>
          {showSecondary ? <span className="legend-paid">{secondaryLabel}</span> : null}
        </div>
      </div>
      {rows.length ? (
        <div className="line-chart-wrap">
          <svg
            className="line-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Grafico de tendencia de ventas y cobros"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity=".20" />
                <stop offset="100%" stopColor="currentColor" stopOpacity=".01" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const gridY = padding.top + chartHeight * ratio;
              const value = max * (1 - ratio);
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
            <polygon className="chart-area" points={areaPoints} fill={`url(#${gradientId})`} />
            <polyline className="chart-line chart-line-total" points={totalPoints} />
            {showSecondary ? (
              <polyline className="chart-line chart-line-paid" points={paidPoints} />
            ) : null}
            {rows.map((row, index) => (
              <g key={row.date}>
                <circle
                  className="chart-dot chart-dot-total"
                  cx={x(index)}
                  cy={y(Number(row.total))}
                  r="4"
                >
                  <title>
                    {shortDate(row.date)}: {primaryLabel.toLowerCase()} {money(row.total)}
                  </title>
                </circle>
                {showSecondary ? (
                  <circle
                    className="chart-dot chart-dot-paid"
                    cx={x(index)}
                    cy={y(Number(row.paid))}
                    r="3"
                  >
                    <title>
                      {shortDate(row.date)}: {secondaryLabel.toLowerCase()} {money(row.paid)}
                    </title>
                  </circle>
                ) : null}
                {index % labelEvery === 0 || index === rows.length - 1 ? (
                  <text
                    className="chart-date-label"
                    x={x(index)}
                    y={height - 14}
                    textAnchor="middle"
                  >
                    {shortDay(row.date)}
                  </text>
                ) : null}
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <ChartEmpty text="Aun no hay ventas suficientes para mostrar una tendencia." />
      )}
    </section>
  );
}

export function ProductRankingChart({
  data,
  compact = false,
  title = 'Productos más vendidos',
  subtitle = 'Unidades entregadas por producto',
  unitLabel = 'un.',
}: {
  data: TopProductRow[];
  compact?: boolean;
  title?: string;
  subtitle?: string;
  unitLabel?: string;
}) {
  const rows = data.slice(0, compact ? 5 : 8);
  const max = Math.max(1, ...rows.map((row) => Number(row.quantity)));
  return (
    <section
      className="business-chart-card product-chart"
      aria-labelledby={`product-chart-${compact ? 'compact' : 'full'}`}
    >
      <div className="chart-card-head">
        <div>
          <span className="chart-card-icon">
            <BarChart3 size={18} />
          </span>
          <div>
            <h3 id={`product-chart-${compact ? 'compact' : 'full'}`}>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </div>
      </div>
      {rows.length ? (
        <div className="ranking-chart">
          {rows.map((row, index) => (
            <div className="ranking-row" key={row.product?.id ?? `${row.product?.name}-${index}`}>
              <div className="ranking-meta">
                <span>{row.product?.name ?? 'Sin nombre'}</span>
                <strong>
                  {row.quantity} {unitLabel}
                </strong>
              </div>
              <div
                className="ranking-track"
                aria-label={`${row.product?.name}: ${row.quantity} ${unitLabel}`}
              >
                <span style={{ width: `${Math.max(3, (Number(row.quantity) / max) * 100)}%` }} />
              </div>
              {compact ? null : <small>{money(row.total)}</small>}
            </div>
          ))}
        </div>
      ) : (
        <ChartEmpty text="Aun no hay datos suficientes para construir el ranking." />
      )}
    </section>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return (
    <div className="chart-empty">
      <BarChart3 size={26} />
      <span>{text}</span>
    </div>
  );
}

function compactMoney(value: number) {
  if (value >= 1000) return `S/${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `S/${Math.round(value)}`;
}

function shortDay(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}
