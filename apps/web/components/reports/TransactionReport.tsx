'use client';

import { Download } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BusinessAnalytics, getBusinessAnalytics, previousPeriodRange } from '../../lib/analytics';
import { axisCaption, buildChartSeries, pickAxis } from '../../lib/chart-axis';
import { moneda, variacion } from '../../lib/format';
import { PeriodFilter, PeriodKind } from '../PeriodFilter';
import { ComparisonBarChart, DemandHeatmap, RankingBarChart } from '../charts/AnalyticsCharts';
import { ProductRankingChart, SalesTrendChart } from '../charts/BusinessCharts';
import { ReportHeader, ReportMetric } from './ReportNav';

type ReportKind = 'sales' | 'expenses';

const localDate = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export function TransactionReport({ kind }: { kind: ReportKind }) {
  const sales = kind === 'sales';
  const [analytics, setAnalytics] = useState<BusinessAnalytics | null>(null);
  const [previous, setPrevious] = useState<BusinessAnalytics | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [period, setPeriod] = useState<PeriodKind>('week');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Se espera a que PeriodFilter publique su rango antes del primer pedido, para que el
    // reporte no muestre por un instante la ventana por defecto de 12 meses del backend.
    if (!from || !to) return;
    setLoading(true);
    // El período comparativo se trae junto al actual para que cada KPI muestre su
    // variación (regla de la skill: nunca un valor sin contexto).
    const priorRange = previousPeriodRange(from, to);
    Promise.all([
      getBusinessAnalytics(from, to),
      getBusinessAnalytics(priorRange.from, priorRange.to),
    ])
      .then(([current, prior]) => {
        setAnalytics(current);
        setPrevious(prior);
      })
      .catch((cause) =>
        toast.error(
          cause instanceof Error ? cause.message : 'No se pudieron calcular los indicadores',
        ),
      )
      .finally(() => setLoading(false));
  }, [from, to]);

  const summary = analytics?.summary;
  const priorSummary = previous?.summary;
  // undefined mientras el período comparativo no ha llegado, para que la tarjeta no
  // muestre una variación calculada con datos a medio cargar.
  const change = (current?: number, prior?: number) =>
    summary && priorSummary ? variacion(current ?? 0, prior ?? 0) : undefined;
  // El eje X sigue al período elegido: día → tramos de 3 horas, semana → días con su nombre,
  // mes → las semanas del mes, año → los meses.
  const axis = pickAxis(period, from, to);
  const series = buildChartSeries(analytics, from, to, axis);
  const trend = series.map((row) => ({
    key: row.key,
    label: row.label,
    labelTop: row.labelTop,
    tooltip: row.tooltip,
    total: sales ? row.sales : row.expenses,
  }));
  const productRows = (analytics?.topProducts ?? []).map((row) => ({
    product: { id: row.id, name: row.name },
    cantidad: row.cantidad,
    total: row.revenue,
  }));
  const changePeriod = useCallback((start: string, end: string, meta: { period: PeriodKind }) => {
    setFrom(start);
    setTo(end);
    setPeriod(meta.period);
  }, []);

  function exportReport() {
    if (!analytics) return;
    const rows: (string | number)[][] = sales
      ? [
          ['Fecha', 'Ventas netas', 'Costo', 'Margen', 'Operaciones'],
          ...analytics.daily.map((row) => [
            row.key,
            row.sales.toFixed(2),
            row.cost.toFixed(2),
            row.margin.toFixed(2),
            row.orders,
          ]),
          [],
          ['Método de pago', 'Ventas', 'Facturado'],
          ...analytics.paymentMethods.map((metodo) => [
            metodo.name,
            metodo.sales,
            metodo.amount.toFixed(2),
          ]),
        ]
      : [
          ['Fecha', 'Ventas', 'Gastos'],
          ...analytics.daily.map((row) => [row.key, row.sales.toFixed(2), row.expenses.toFixed(2)]),
        ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-${sales ? 'ventas' : 'gastos'}-${from || 'inicio'}-${to || localDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="module-page report-page">
      <ReportHeader
        eyebrow="Reportes"
        title={sales ? 'Ventas y rentabilidad' : 'Gastos y ventas'}
      />
      <section className="report-metrics">
        <ReportMetric
          label={sales ? 'Ventas netas' : 'Gastos registrados'}
          value={moneda(sales ? summary?.sales : summary?.expenses)}
          detail={sales ? 'Operaciones confirmadas del período' : 'Egresos del período'}
          change={change(
            sales ? summary?.sales : summary?.expenses,
            sales ? priorSummary?.sales : priorSummary?.expenses,
          )}
        />
        <ReportMetric
          label={sales ? 'Margen bruto' : 'Ventas del período'}
          value={moneda(sales ? summary?.margin : summary?.sales)}
          detail={
            sales
              ? `Ingresos menos costo de inventario · ${(summary?.marginRate ?? 0).toFixed(1)}%`
              : 'Base de comparación'
          }
          change={change(
            sales ? summary?.margin : summary?.sales,
            sales ? priorSummary?.margin : priorSummary?.sales,
          )}
        />
        <ReportMetric
          label={sales ? 'Pedidos / ventas' : 'Registros de gasto'}
          value={sales ? (summary?.orders ?? 0) : (summary?.expenseCount ?? 0)}
          detail={sales ? 'Operaciones confirmadas' : 'Gastos registrados'}
          change={change(
            sales ? summary?.orders : summary?.expenseCount,
            sales ? priorSummary?.orders : priorSummary?.expenseCount,
          )}
        />
        <ReportMetric
          label={sales ? 'Ticket promedio' : 'Gasto promedio'}
          value={moneda(sales ? summary?.ticket : summary?.averageExpense)}
          detail={sales ? 'Venta promedio por operación' : 'Promedio por registro'}
          change={change(
            sales ? summary?.ticket : summary?.averageExpense,
            sales ? priorSummary?.ticket : priorSummary?.averageExpense,
          )}
        />
      </section>
      <PeriodFilter onChange={changePeriod} />
      <div className="module-tools report-filters">
        <button
          type="button"
          className="report-export-button"
          onClick={exportReport}
          disabled={!analytics || loading}
        >
          <Download size={16} /> Exportar CSV
        </button>
      </div>
      {loading ? (
        <div className="table-loading">
          <span className="loading-spinner" /> Calculando indicadores...
        </div>
      ) : analytics ? (
        <section className="analytics-report-grid" aria-label="Gráficos del reporte">
          <SalesTrendChart
            data={trend}
            title={sales ? 'Ventas en el tiempo' : 'Gastos en el tiempo'}
            subtitle={
              sales
                ? `Importe neto confirmado ${axisCaption[axis]}`
                : `Egresos registrados ${axisCaption[axis]}`
            }
            primaryLabel={sales ? 'Ventas' : 'Gastos'}
            showSecondary={false}
          />
          {sales ? (
            <ProductRankingChart
              data={productRows}
              title="Productos más vendidos"
              subtitle="Unidades netas después de devoluciones"
            />
          ) : (
            <RankingBarChart
              rows={analytics.expenseCategories}
              title="Gastos por categoría"
              subtitle="Importe acumulado y cantidad de registros"
            />
          )}
          <ComparisonBarChart
            data={series}
            title={sales ? 'Ventas vs gastos' : 'Gastos vs ventas'}
            subtitle={`Importes registrados ${axisCaption[axis]}`}
          />
          {sales ? (
            <RankingBarChart
              rows={analytics.topProducts
                .map((row) => ({
                  id: row.id,
                  name: row.name,
                  value: row.margin,
                  count: Math.round(row.cantidad),
                }))
                .sort((a, b) => b.value - a.value)}
              title="Margen por producto"
              subtitle="Ingreso sin IGV menos costo de inventario"
              detail={(row) => `${row.count} unidades netas`}
            />
          ) : null}
          {sales ? (
            <RankingBarChart
              rows={analytics.zones}
              title="Ventas por zona / dirección"
              subtitle="Áreas registradas con mayor facturación"
              icon="zone"
            />
          ) : (
            <RankingBarChart
              rows={analytics.expenseCategories}
              title="Categorías principales"
              subtitle="Las categorías con mayor egreso"
            />
          )}
          {sales ? (
            <RankingBarChart
              rows={analytics.paymentMethods.map((metodo) => ({
                id: metodo.id,
                name: metodo.name,
                value: metodo.sales,
                count: metodo.sales,
              }))}
              title="Ventas por método de pago"
              subtitle="Cantidad de ventas por forma de cobro"
              valueKind="count"
              detail={(row) => {
                const metodo = analytics.paymentMethods.find((item) => item.id === row.id);
                return `${moneda(metodo?.amount ?? 0)} facturado`;
              }}
            />
          ) : null}
          {sales ? (
            <RankingBarChart
              rows={analytics.topClients}
              title="Top clientes"
              subtitle="Clientes con mayor consumo neto"
            />
          ) : null}
          {sales ? (
            <div className="analytics-wide">
              <DemandHeatmap data={analytics.heatmap} />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
