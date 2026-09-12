'use client';

import { CircleDollarSign, HandCoins, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PeriodFilter, PeriodKind } from '../../../components/PeriodFilter';
import {
  ComparisonBarChart,
  MarginChart,
  RankingBarChart,
} from '../../../components/charts/AnalyticsCharts';
import { BusinessDashboard, getBusinessDashboard } from '../../../lib/dashboard';
import { buildReportSeries } from '../../../lib/report-series';
import { moneda } from '../../../lib/format';
import { DashboardKpi } from './DashboardKpi';

export function AdminDashboard() {
  const [data, setData] = useState<BusinessDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [period, setPeriod] = useState<PeriodKind>('week');
  const changePeriod = useCallback(
    (start: string, end: string, meta: { period: PeriodKind; label: string }) => {
      setFrom(start);
      setTo(end);
      setPeriodLabel(meta.label);
      setPeriod(meta.period);
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
    // Se espera a que PeriodFilter publique su rango para que el panel pida los datos una sola
    // vez con la ventana real, en vez de disparar además un pedido con el defecto de 12 meses.
    if (from && to) void load();
  }, [from, load, to]);

  const analytics = data?.analytics;
  // El eje X sigue al filtro: día → horas, semana → sus 7 días, mes → sus semanas,
  // año → sus meses, y personalizada según el largo del rango.
  const series = buildReportSeries(analytics, from, to, period);
  const comparisonSubtitle = `Importes registrados ${series.granularityLabel}`;
  const marginSubtitle = `Ventas menos gastos · ${series.granularityLabel}`;
  const profitSeries = series.rows.map((row) => ({ ...row, margin: row.sales - row.expenses }));

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
              value={moneda(analytics?.summary.sales)}
              detail={`${analytics?.summary.orders ?? 0} operaciones del período`}
              tone="blue"
            />
            <DashboardKpi
              icon={<Truck size={21} />}
              label="Gastos"
              value={moneda(analytics?.summary.expenses)}
              detail="Egresos registrados"
              tone="amber"
            />
            <DashboardKpi
              icon={<PackageCheck size={21} />}
              label="Margen"
              value={moneda(analytics?.summary.profit)}
              detail={`${(analytics?.summary.profitRate ?? 0).toFixed(1)}% sobre ventas`}
              tone="green"
            />
            <DashboardKpi
              icon={<HandCoins size={21} />}
              label="Por cobrar"
              value={moneda(analytics?.receivables.total)}
              detail={
                (analytics?.receivables.overdueCount ?? 0) > 0
                  ? `${analytics?.receivables.overdueCount} vencidas · ${moneda(
                      analytics?.receivables.overdue,
                    )}`
                  : `${analytics?.receivables.count ?? 0} comprobantes pendientes`
              }
              tone="amber"
              href="/cobranzas"
            />
          </section>

          <section className="dashboard-chart-grid" aria-label="Ventas vs gastos y top clientes">
            <ComparisonBarChart
              data={series.rows}
              subtitle={comparisonSubtitle}
              tickEvery={series.tickEvery}
            />
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
            <MarginChart
              data={profitSeries}
              subtitle={marginSubtitle}
              tickEvery={series.tickEvery}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
