'use client';

import { CircleDollarSign, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PeriodFilter, PeriodKind } from '../../../components/PeriodFilter';
import {
  ComparisonBarChart,
  MarginChart,
  RankingBarChart,
} from '../../../components/charts/AnalyticsCharts';
import { fillDailySeries, fillMonthlySeries, groupPeriodsByYear } from '../../../lib/analytics';
import { BusinessDashboard, getBusinessDashboard } from '../../../lib/dashboard';
import { money } from '../../../lib/format';

type Granularity = 'day' | 'month' | 'year';

const granularityLabel: Record<Granularity, string> = {
  day: 'por día',
  month: 'por mes',
  year: 'por año',
};

/** Day/week fit within a month → daily bars; beyond a month → monthly; beyond a year → yearly. */
function pickGranularity(spanDays: number): Granularity {
  if (spanDays > 366) return 'year';
  if (spanDays > 31) return 'month';
  return 'day';
}

export default function DashboardPage() {
  const [data, setData] = useState<BusinessDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const changePeriod = useCallback(
    (start: string, end: string, meta: { period: PeriodKind; label: string }) => {
      setFrom(start);
      setTo(end);
      setPeriodLabel(meta.label);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getBusinessDashboard(from || undefined, to || undefined));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el resumen del negocio');
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    void load();
  }, [load]);

  const analytics = data?.analytics;
  const spanDays =
    from && to
      ? Math.round(
          (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) /
            86_400_000,
        ) + 1
      : 0;
  const granularity = pickGranularity(spanDays);
  const periodSeries =
    granularity === 'day'
      ? fillDailySeries(analytics?.daily ?? [], from, to)
      : granularity === 'month'
        ? fillMonthlySeries(analytics?.monthly ?? [], from, to)
        : groupPeriodsByYear(analytics?.monthly ?? []);
  const comparisonSubtitle = `Importes registrados ${granularityLabel[granularity]}`;
  const marginSubtitle = `Venta sin IGV menos costo de inventario · ${granularityLabel[granularity]}`;

  return (
    <div className="module-page business-dashboard">
      <div className="dashboard-head">
        <div>
          <h1>Resumen del negocio</h1>
          <span className="operation-eyebrow dashboard-period-label">{periodLabel}</span>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'dashboard-spinning' : ''} /> Actualizar
        </button>
      </div>

      <PeriodFilter onChange={changePeriod} hideRangeHint />

      {error ? (
        <div className="notice-error" role="alert">
          {error}
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      ) : null}
      {loading && !data ? (
        <div className="dashboard-loading" role="status">
          <span className="loading-spinner" /> Preparando indicadores del negocio...
        </div>
      ) : null}

      {data ? (
        <>
          <section className="dashboard-kpis" aria-label="Indicadores principales">
            <DashboardKpi
              icon={<CircleDollarSign size={21} />}
              label="Ventas"
              value={money(analytics?.summary.sales)}
              detail={`${analytics?.summary.orders ?? 0} operaciones del período`}
              tone="blue"
            />
            <DashboardKpi
              icon={<Truck size={21} />}
              label="Gastos"
              value={money(analytics?.summary.expenses)}
              detail="Egresos registrados"
              tone="amber"
            />
            <DashboardKpi
              icon={<PackageCheck size={21} />}
              label="Margen"
              value={money(analytics?.summary.margin)}
              detail={`${(analytics?.summary.marginRate ?? 0).toFixed(1)}% sobre ventas`}
              tone="green"
            />
          </section>

          <section className="dashboard-chart-grid" aria-label="Ventas vs gastos y top clientes">
            <ComparisonBarChart data={periodSeries} subtitle={comparisonSubtitle} />
            <RankingBarChart
              rows={analytics?.topClients ?? []}
              title="Top clientes"
              subtitle="Clientes con mayor consumo neto"
            />
          </section>

          <section
            className="dashboard-chart-grid dashboard-chart-grid-reverse"
            aria-label="Ventas por zonas e historial de margen"
          >
            <RankingBarChart
              rows={analytics?.zones ?? []}
              title="Ventas por zonas"
              subtitle="Áreas registradas con mayor facturación"
              icon="zone"
            />
            <MarginChart data={periodSeries} subtitle={marginSubtitle} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function DashboardKpi({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
  tone: string;
}) {
  return (
    <article className={`dashboard-kpi dashboard-kpi-${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
