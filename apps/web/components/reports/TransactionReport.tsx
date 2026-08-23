"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { BusinessAnalytics, getBusinessAnalytics } from "../../lib/analytics";
import { money } from "../../lib/format";
import { ComparisonBarChart, DemandHeatmap, MixAndPaymentsChart, RankingBarChart } from "../charts/AnalyticsCharts";
import { ProductRankingChart, SalesTrendChart } from "../charts/BusinessCharts";
import { ReportHeader, ReportMetric } from "./ReportNav";

type ReportKind = "sales" | "expenses";

const localDate = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export function TransactionReport({ kind }: { kind: ReportKind }) {
  const sales = kind === "sales";
  const [analytics, setAnalytics] = useState<BusinessAnalytics | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    getBusinessAnalytics(from || undefined, to || undefined)
      .then(setAnalytics)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudieron calcular los indicadores"))
      .finally(() => setLoading(false));
  }, [from, to]);

  const summary = analytics?.summary;
  const trend = (analytics?.daily ?? []).map((row) => ({ date: row.key, total: sales ? row.sales : row.expenses, paid: 0, debt: 0, count: row.orders }));
  const productRows = (analytics?.topProducts ?? []).map((row) => ({ product: { id: row.id, name: row.name }, quantity: row.quantity, total: row.revenue }));

  function usePeriod(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    setFrom(localDate(start));
    setTo(localDate(end));
  }

  function exportReport() {
    if (!analytics) return;
    const rows: (string | number)[][] = sales
      ? [["Fecha", "Ventas netas", "Costo", "Margen", "Operaciones"], ...analytics.daily.map((row) => [row.key, row.sales.toFixed(2), row.cost.toFixed(2), row.margin.toFixed(2), row.orders])]
      : [["Fecha", "Ventas", "Gastos"], ...analytics.daily.map((row) => [row.key, row.sales.toFixed(2), row.expenses.toFixed(2)])];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-${sales ? "ventas" : "gastos"}-${from || "inicio"}-${to || localDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="module-page report-page">
    <ReportHeader eyebrow="Reportes" title={sales ? "Ventas y rentabilidad" : "Gastos y ventas"} description={sales ? "Analiza ingresos, demanda, clientes, zonas y hábitos de compra con datos confirmados." : "Compara los egresos registrados con las ventas del mismo período."} />
    <section className="report-metrics"><ReportMetric label={sales ? "Ventas netas" : "Gastos registrados"} value={money(sales ? summary?.sales : summary?.expenses)} detail={sales ? "Operaciones confirmadas del período" : "Egresos del período"} /><ReportMetric label={sales ? "Margen bruto" : "Ventas del período"} value={money(sales ? summary?.margin : summary?.sales)} detail={sales ? `${(summary?.marginRate ?? 0).toFixed(1)}% sobre ventas` : "Base de comparación"} /><ReportMetric label={sales ? "Pedidos / ventas" : "Registros de gasto"} value={sales ? summary?.orders ?? 0 : summary?.expenseCount ?? 0} detail={sales ? "Operaciones confirmadas" : "Gastos registrados"} /><ReportMetric label={sales ? "Ticket promedio" : "Gasto promedio"} value={money(sales ? summary?.ticket : summary?.averageExpense)} detail={sales ? "Venta promedio por operación" : "Promedio por registro"} /></section>
    <div className="report-period-shortcuts" aria-label="Períodos rápidos"><button type="button" onClick={() => usePeriod(7)}>7 días</button><button type="button" onClick={() => usePeriod(30)}>30 días</button><button type="button" onClick={() => usePeriod(90)}>90 días</button></div>
    <div className="module-tools report-filters"><label className="report-date-filter"><span>Desde</span><input type="date" max={to || localDate()} value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="report-date-filter"><span>Hasta</span><input type="date" min={from || undefined} max={localDate()} value={to} onChange={(event) => setTo(event.target.value)} /></label><button type="button" className="report-clear-filter" onClick={() => { setFrom(""); setTo(""); }}>Todo el período</button><button type="button" className="report-export-button" onClick={exportReport} disabled={!analytics || loading}><Download size={16} /> Exportar CSV</button></div>
    {error ? <div className="notice-error" role="alert">{error}</div> : null}
    {loading ? <div className="table-loading"><span className="loading-spinner" /> Calculando indicadores...</div> : analytics ? <section className="analytics-report-grid" aria-label="Gráficos del reporte">
      <SalesTrendChart data={trend} title={sales ? "Ventas en el tiempo" : "Gastos en el tiempo"} subtitle={sales ? "Importe neto confirmado por día" : "Egresos registrados por día"} primaryLabel={sales ? "Ventas" : "Gastos"} showSecondary={false} />
      {sales ? <ProductRankingChart data={productRows} title="Productos más vendidos" subtitle="Unidades netas después de devoluciones" /> : <RankingBarChart rows={analytics.expenseCategories} title="Gastos por categoría" subtitle="Importe acumulado y cantidad de registros" />}
      <ComparisonBarChart data={analytics.monthly} title={sales ? "Ventas vs gastos" : "Gastos vs ventas"} />
      {sales ? <RankingBarChart rows={analytics.topProducts.map((row) => ({ id: row.id, name: row.name, value: row.margin, count: Math.round(row.quantity) })).sort((a, b) => b.value - a.value)} title="Margen por producto" subtitle="Ingreso sin IGV menos costo de inventario" detail={(row) => `${row.count} unidades netas`} /> : null}
      {sales ? <RankingBarChart rows={analytics.zones} title="Ventas por zona / dirección" subtitle="Áreas registradas con mayor facturación" icon="zone" /> : <RankingBarChart rows={analytics.expenseCategories} title="Categorías principales" subtitle="Las categorías con mayor egreso" />}
      {sales ? <RankingBarChart rows={analytics.topClients} title="Top clientes" subtitle="Clientes con mayor consumo neto" /> : null}
      {sales ? <MixAndPaymentsChart customerMix={analytics.customerMix} payments={analytics.paymentMethods} /> : null}
      {sales ? <div className="analytics-wide"><DemandHeatmap data={analytics.heatmap} /></div> : null}
    </section> : null}
  </div>;
}
