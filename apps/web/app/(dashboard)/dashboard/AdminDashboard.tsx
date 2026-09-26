'use client';

import { useQuery } from '@tanstack/react-query';
import { Droplet, HandCoins, Truck, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PeriodFilter, PeriodKind } from '../../../components/PeriodFilter';
import { useUnidad } from '../../../components/UnidadProvider';
import {
  ComparisonBarChart,
  MarginChart,
} from '../../../components/charts/AnalyticsCharts';
import { StatCard } from '../../../components/dashboard/StatCard';
import { StatHero } from '../../../components/dashboard/StatHero';
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
  // Solo se usa como disparador: la unidad viaja al API desde `api()`. El selector vive en la
  // barra superior, porque la unidad vale para toda la app y no solo para este panel.
  const { clave: unidad, resumen: unidadResumen } = useUnidad();
  const changePeriod = useCallback(
    (start: string, end: string, meta: { period: PeriodKind; label: string }) => {
      setFrom(start);
      setTo(end);
      setPeriod(meta.period);
      setEtiquetaPeriodo(meta.label);
    },
    [],
  );

  // Las dos consultas van separadas: si la lista de ventas falla por permisos o por red, el
  // panel de indicadores sigue sirviendo. `enabled` espera a que PeriodFilter publique su
  // rango, para no disparar un pedido con el defecto de 12 meses primero.
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
  // El eje X sigue al período elegido: día → tramos de 3 horas, semana → días con su nombre,
  // mes → las semanas del mes, año → los meses.
  const axis = pickAxis(period, from, to);
  const periodSeries = buildChartSeries(analytics ?? null, from, to, axis);
  const comparisonSubtitle = `Importes registrados ${axisCaption[axis]}`;
  const marginSubtitle = `Ventas menos gastos · ${axisCaption[axis]}`;
  const profitSeries = periodSeries.map((row) => ({ ...row, margin: row.sales - row.expenses }));
  const caption = comparativo[period];
  // La misma etiqueta humana que publica el filtro acompaña todos los títulos cuyos datos
  // dependen del rango. Así no se pierde el contexto al recorrer las tarjetas y gráficos.
  const conPeriodo = (titulo: string) =>
    etiquetaPeriodo ? `${titulo} · ${etiquetaPeriodo}` : titulo;

  return (
    <div className="module-page business-dashboard">
      <div className="dashboard-head">
        <div>
          <h1>{conPeriodo('Resumen del negocio')}</h1>
          {unidadResumen ? (
            <span className="report-scope-caption">Alcance: {unidadResumen}</span>
          ) : null}
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
              icon={<Droplet size={19} />}
              label={conPeriodo('Bidones entregados')}
              value={analytics?.summary.bidones ?? 0}
              detail={`${analytics?.summary.orders ?? 0} operaciones`}
              tone="blue"
              change={
                anterior ? variacion(analytics?.summary.bidones ?? 0, anterior.bidones) : undefined
              }
              changeCaption={caption}
            />
            <StatCard
              icon={<Truck size={19} />}
              label={conPeriodo('Gastos')}
              value={moneda(analytics?.summary.expenses)}
              detail="Egresos registrados"
              tone="amber"
              change={
                anterior
                  ? variacion(analytics?.summary.expenses ?? 0, anterior.expenses)
                  : undefined
              }
              changeCaption={caption}
            />
            <StatCard
              icon={<HandCoins size={19} />}
              label={conPeriodo('Por cobrar (saldo actual)')}
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
            <StatCard
              icon={<UserPlus size={19} />}
              label={conPeriodo('Clientes nuevos')}
              value={analytics?.summary.newClients ?? 0}
              detail="Dados de alta en el período"
              tone="green"
              change={
                anterior
                  ? variacion(analytics?.summary.newClients ?? 0, anterior.newClients)
                  : undefined
              }
              changeCaption={caption}
            />
          </section>

          <StatHero
            label={conPeriodo('Ventas')}
            value={moneda(analytics?.summary.sales)}
            change={anterior ? variacion(analytics?.summary.sales ?? 0, anterior.sales) : undefined}
            changeCaption={caption}
            series={periodSeries.map((row) => row.sales)}
          />

          <div className="dashboard-single-chart">
            <ComparisonBarChart
              data={periodSeries}
              title={conPeriodo('Ventas vs gastos')}
              subtitle={comparisonSubtitle}
            />
          </div>

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
