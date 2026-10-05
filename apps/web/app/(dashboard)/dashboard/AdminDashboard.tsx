'use client';

import { useQuery } from '@tanstack/react-query';
import { HandCoins, ReceiptText, TrendingUp, Truck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PeriodFilter, PeriodKind } from '../../../components/PeriodFilter';
import { useUnidad } from '../../../components/UnidadProvider';
import { MarginChart } from '../../../components/charts/AnalyticsCharts';
import { StatCard } from '../../../components/dashboard/StatCard';
import { SalesExpensesChart } from '../../../components/dashboard/SalesExpensesChart';
import { axisCaption, buildChartSeries, pickAxis } from '../../../lib/chart-axis';
import { getBusinessDashboard } from '../../../lib/dashboard';
import { moneda, variacion } from '../../../lib/format';

/** Cómo se nombra el período anterior en la variación, según lo que se esté mirando. */
const comparativo: Record<PeriodKind, string> = {
  day: 'vs. el día anterior',
  week: 'vs. la semana anterior',
  month: 'vs. el mes anterior',
  year: 'vs. el año anterior',
  custom: 'vs. el período anterior',
};

export function AdminDashboard() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [period, setPeriod] = useState<PeriodKind>('month');
  const [etiquetaPeriodo, setEtiquetaPeriodo] = useState('');
  const { clave: unidad } = useUnidad();

  const changePeriod = useCallback(
    (start: string, end: string, meta: { period: PeriodKind; label: string }) => {
      setFrom(start);
      setTo(end);
      setPeriod(meta.period);
      setEtiquetaPeriodo(meta.label);
    },
    [],
  );

  const dataQuery = useQuery({
    queryKey: ['business-dashboard', from, to, unidad],
    queryFn: () => getBusinessDashboard(from || undefined, to || undefined, true),
    enabled: Boolean(from && to),
  });

  const data = dataQuery.data ?? null;
  const loading = dataQuery.isPending;

  useEffect(() => {
    if (dataQuery.error) {
      toast.error(
        dataQuery.error instanceof Error
          ? dataQuery.error.message
          : 'No se pudo cargar el resumen del negocio',
        { action: { label: 'Reintentar', onClick: () => void dataQuery.refetch() } },
      );
    }
  }, [dataQuery.error, dataQuery.refetch]);

  const analytics = data?.analytics;
  const anterior = analytics?.previous ?? null;
  const margen = (analytics?.summary.sales ?? 0) - (analytics?.summary.expenses ?? 0);
  const margenAnterior = anterior ? anterior.sales - anterior.expenses : null;
  const cambioMargen = margenAnterior !== null ? variacion(margen, margenAnterior) : undefined;
  if (cambioMargen && margenAnterior !== null) {
    // Una pérdida menor es una mejora: la base del porcentaje debe ser positiva.
    if (margenAnterior < 0) {
      const porcentaje = ((margen - margenAnterior) / Math.abs(margenAnterior)) * 100;
      cambioMargen.texto = `${porcentaje > 0 ? '+' : ''}${porcentaje.toFixed(1)}%`;
    }
    if (cambioMargen.direccion !== 'na') {
      cambioMargen.direccion =
        margen > margenAnterior ? 'up' : margen < margenAnterior ? 'down' : 'flat';
    }
  }
  // El eje X sigue al período elegido: día → tramos de 3 horas, semana → días con su nombre,
  // mes → las semanas del mes, año → los meses.
  const axis = pickAxis(period, from, to);
  const periodSeries = buildChartSeries(analytics ?? null, from, to, axis);
  const marginSubtitle = `Ventas menos gastos · ${axisCaption[axis]}`;
  const profitSeries = periodSeries.map((row) => ({ ...row, margin: row.sales - row.expenses }));
  const caption = comparativo[period];
  const conPeriodo = (titulo: string) =>
    etiquetaPeriodo ? `${titulo} en ${etiquetaPeriodo}` : titulo;

  return (
    <div className="module-page business-dashboard">
      <div className="dashboard-head">
        <div>
          <h1>{conPeriodo('Resumen del negocio')}</h1>
        </div>
      </div>

      <PeriodFilter defaultPeriod="month" onChange={changePeriod} />

      {loading && !data ? (
        <div className="dashboard-loading" role="status">
          <span className="loading-spinner" /> Preparando indicadores del negocio...
        </div>
      ) : null}

      {data ? (
        <>
          <section className="stat-grid" aria-label="Indicadores principales">
            <StatCard
              icon={<Truck size={19} />}
              label="Gastos totales"
              value={moneda(analytics?.summary.expenses)}
              detail="Egresos registrados"
              tone="amber"
              invertir
              change={
                anterior
                  ? variacion(analytics?.summary.expenses ?? 0, anterior.expenses)
                  : undefined
              }
              changeCaption={caption}
            />
            <StatCard
              icon={<ReceiptText size={19} />}
              label="Ventas totales"
              value={moneda(analytics?.summary.sales)}
              detail="Ventas netas del período"
              tone="blue"
              change={
                anterior ? variacion(analytics?.summary.sales ?? 0, anterior.sales) : undefined
              }
              changeCaption={caption}
            />
            <StatCard
              icon={<TrendingUp size={19} />}
              label="Margen"
              value={moneda(margen)}
              detail="Ventas menos gastos"
              tone={margen < 0 ? 'red' : 'green'}
              valueTone={margen > 0 ? 'green' : margen < 0 ? 'red' : undefined}
              change={cambioMargen}
              changeCaption={caption}
            />
            <StatCard
              icon={<HandCoins size={19} />}
              label="Por cobrar (saldo actual)"
              value={moneda(analytics?.receivables.total)}
              detail={
                (analytics?.receivables.overdueCount ?? 0) > 0
                  ? `${analytics?.receivables.overdueCount} vencidas · ${moneda(
                      analytics?.receivables.overdue,
                    )}`
                  : `${analytics?.receivables.count ?? 0} comprobantes pendientes`
              }
              tone="red"
              href="/cobranzas"
            />
          </section>

          <SalesExpensesChart title={conPeriodo('Ventas y gastos')} data={periodSeries} />

          <MarginChart
            data={profitSeries}
            title={conPeriodo('Evolución del margen')}
            subtitle={marginSubtitle}
          />
        </>
      ) : null}
    </div>
  );
}
