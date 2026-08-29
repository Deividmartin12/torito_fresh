'use client';

import { CircleDollarSign, HandCoins, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
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
    try {
      setData(await getBusinessDashboard(from || undefined, to || undefined));
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : 'No se pudo cargar el resumen del negocio',
        { action: { label: 'Reintentar', onClick: () => void load() } },
      );
    } finally {
      setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    // Wait for PeriodFilter to publish its range so the dashboard fetches once with the
    // real window instead of also firing a request with the backend's 12-month default.
    if (from && to) void load();
  }, [from, load, to]);

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
  const marginSubtitle = `Ventas menos gastos · ${granularityLabel[granularity]}`;
  const profitSeries = periodSeries.map((row) => ({ ...row, margin: row.sales - row.expenses }));

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
              value={money(analytics?.summary.profit)}
              detail={`${(analytics?.summary.profitRate ?? 0).toFixed(1)}% sobre ventas`}
              tone="green"
            />
            <DashboardKpi
              icon={<HandCoins size={21} />}
              label="Por cobrar"
              value={money(analytics?.receivables.total)}
              detail={
                (analytics?.receivables.overdueCount ?? 0) > 0
                  ? `${analytics?.receivables.overdueCount} vencidas · ${money(
                      analytics?.receivables.overdue,
                    )}`
                  : `${analytics?.receivables.count ?? 0} comprobantes pendientes`
              }
              tone="amber"
              href="/cobranzas"
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
            <MarginChart data={profitSeries} subtitle={marginSubtitle} />
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
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
  tone: string;
  href?: string;
}) {
  const content = (
    <>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </>
  );
  const className = `dashboard-kpi dashboard-kpi-${tone}`;
  return href ? (
    <Link className={`${className} dashboard-kpi-link`} href={href}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}
