'use client';

import { CircleDollarSign, HandCoins, PackageCheck, Truck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PeriodFilter, PeriodKind } from '../../../components/PeriodFilter';
import {
  ComparisonBarChart,
  MarginChart,
  RankingBarChart,
} from '../../../components/charts/AnalyticsCharts';
import { axisCaption, buildChartSeries, pickAxis } from '../../../lib/chart-axis';
import { BusinessDashboard, getBusinessDashboard } from '../../../lib/dashboard';
import { moneda } from '../../../lib/format';
import { DashboardKpi } from './DashboardKpi';

export function AdminDashboard() {
  const [data, setData] = useState<BusinessDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [period, setPeriod] = useState<PeriodKind>('week');
  const changePeriod = useCallback((start: string, end: string, meta: { period: PeriodKind }) => {
    setFrom(start);
    setTo(end);
    setPeriod(meta.period);
  }, []);

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
  // El eje X sigue al período elegido: día → tramos de 3 horas, semana → días con su nombre,
  // mes → las semanas del mes, año → los meses.
  const axis = pickAxis(period, from, to);
  const periodSeries = buildChartSeries(analytics ?? null, from, to, axis);
  const comparisonSubtitle = `Importes registrados ${axisCaption[axis]}`;
  const marginSubtitle = `Ventas menos gastos · ${axisCaption[axis]}`;
  const profitSeries = periodSeries.map((row) => ({ ...row, margin: row.sales - row.expenses }));

  return (
    <div className="module-page business-dashboard">
      <div className="dashboard-head">
        <div>
          <h1>Resumen del negocio</h1>
        </div>
      </div>

      <PeriodFilter onChange={changePeriod} />

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
