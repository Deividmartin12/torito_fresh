"use client";

import { BarChart3, CalendarClock, MapPinned, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { AnalyticsPeriod, AnalyticsRanking, HeatmapPoint } from "../../lib/analytics";
import { money } from "../../lib/format";

export function ComparisonBarChart({ data, title = "Ventas vs gastos", subtitle = "Importes registrados por mes" }: { data: AnalyticsPeriod[]; title?: string; subtitle?: string }) {
  const rows = data.slice(-12);
  const max = Math.max(1, ...rows.flatMap((row) => [row.sales, row.expenses]));
  return <ChartCard icon={<BarChart3 size={18} />} title={title} subtitle={subtitle} legend={<><span className="legend-sales">Ventas</span><span className="legend-purchases">Gastos</span></>}>
    {rows.length ? <div className="comparison-chart">{rows.map((row) => <div className="comparison-column" key={row.key}><div className="comparison-bars"><span className="comparison-sales" style={{ height: `${Math.max(row.sales ? 4 : 0, row.sales / max * 100)}%` }} title={`Ventas: ${money(row.sales)}`} /><span className="comparison-purchases" style={{ height: `${Math.max(row.expenses ? 4 : 0, row.expenses / max * 100)}%` }} title={`Gastos: ${money(row.expenses)}`} /></div><small>{row.label}</small></div>)}</div> : <ChartEmpty />}
  </ChartCard>;
}

export function RankingBarChart({ rows, title, subtitle, valueKind = "money", icon = "ranking", detail }: { rows: AnalyticsRanking[]; title: string; subtitle: string; valueKind?: "money" | "count"; icon?: "ranking" | "zone"; detail?: (row: AnalyticsRanking) => string }) {
  const visible = rows.slice(0, 8);
  const max = Math.max(1, ...visible.map((row) => row.value));
  return <ChartCard icon={icon === "zone" ? <MapPinned size={18} /> : <BarChart3 size={18} />} title={title} subtitle={subtitle}>
    {visible.length ? <div className="analytics-ranking">{visible.map((row) => <div key={`${row.id}-${row.name}`}><div><span title={row.name}>{row.name}</span><strong>{valueKind === "money" ? money(row.value) : row.value}</strong></div><div className="analytics-track"><span style={{ width: `${Math.max(3, row.value / max * 100)}%` }} /></div><small>{detail ? detail(row) : `${row.count} ${row.count === 1 ? "operación" : "operaciones"}`}</small></div>)}</div> : <ChartEmpty />}
  </ChartCard>;
}

export function MarginChart({ data }: { data: AnalyticsPeriod[] }) {
  const rows = data.slice(-12);
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.margin)));
  return <ChartCard icon={<TrendingUp size={18} />} title="Evolución del margen" subtitle="Venta sin IGV menos costo de inventario">
    {rows.length ? <div className="margin-chart">{rows.map((row) => <div key={row.key}><span>{row.label}</span><div><i className={row.margin < 0 ? "negative" : ""} style={{ width: `${Math.max(2, Math.abs(row.margin) / max * 100)}%` }} /></div><strong className={row.margin < 0 ? "negative-text" : ""}>{money(row.margin)}</strong></div>)}</div> : <ChartEmpty />}
  </ChartCard>;
}

export function DemandHeatmap({ data }: { data: HeatmapPoint[] }) {
  const hours = useMemo(() => {
    const populated = [...new Set(data.map((point) => point.hour))].sort((a, b) => a - b);
    if (!populated.length) return [8, 10, 12, 14, 16, 18];
    const min = Math.max(0, Math.min(...populated)); const max = Math.min(23, Math.max(...populated));
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }, [data]);
  const max = Math.max(1, ...data.map((point) => point.orders));
  const days = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
  const byCell = new Map(data.map((point) => [`${point.day}-${point.hour}`, point]));
  return <ChartCard icon={<CalendarClock size={18} />} title="Demanda por día y hora" subtitle="Cantidad de ventas confirmadas; más oscuro significa más demanda">
    <div className="demand-heatmap" style={{ gridTemplateColumns: `90px repeat(${hours.length}, minmax(32px, 1fr))` }}><span />{hours.map((hour) => <strong key={hour}>{`${String(hour).padStart(2, "0")}:00`}</strong>)}{days.map((day, dayIndex) => <HeatmapRow key={day} day={day} dayIndex={dayIndex} hours={hours} byCell={byCell} max={max} />)}</div>
  </ChartCard>;
}

function HeatmapRow({ day, dayIndex, hours, byCell, max }: { day: string; dayIndex: number; hours: number[]; byCell: Map<string, HeatmapPoint>; max: number }) {
  return <><span>{day}</span>{hours.map((hour) => { const point = byCell.get(`${dayIndex}-${hour}`); const intensity = (point?.orders ?? 0) / max; return <i key={hour} style={{ "--heat": intensity } as React.CSSProperties} title={`${day} ${hour}:00 · ${point?.orders ?? 0} ventas · ${money(point?.sales ?? 0)}`}>{point?.orders || ""}</i>; })}</>;
}

export function MixAndPaymentsChart({ customerMix, payments }: { customerMix: { new: number; recurring: number }; payments: { name: string; value: number }[] }) {
  const totalMix = customerMix.new + customerMix.recurring;
  const paymentTotal = payments.reduce((sum, item) => sum + item.value, 0);
  return <ChartCard icon={<BarChart3 size={18} />} title="Fidelización y métodos de pago" subtitle="Participación de clientes y composición de cobros">
    <div className="mix-section"><div className="mix-title"><span>Nuevo vs recurrente</span><strong>{totalMix ? `${Math.round(customerMix.recurring / totalMix * 100)}% recurrente` : "Sin datos"}</strong></div><div className="mix-stack"><span style={{ width: `${totalMix ? customerMix.new / totalMix * 100 : 0}%` }} /><i style={{ width: `${totalMix ? customerMix.recurring / totalMix * 100 : 0}%` }} /></div><div className="mix-legend"><span>Nuevos {money(customerMix.new)}</span><span>Recurrentes {money(customerMix.recurring)}</span></div></div>
    <div className="payment-bars">{payments.map((item) => <div key={item.name}><span>{item.name}</span><div><i style={{ width: `${paymentTotal ? item.value / paymentTotal * 100 : 0}%` }} /></div><strong>{money(item.value)}</strong></div>)}</div>
  </ChartCard>;
}

function ChartCard({ icon, title, subtitle, legend, action, children }: { icon: React.ReactNode; title: string; subtitle: string; legend?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="business-chart-card"><div className="chart-card-head"><div><span className="chart-card-icon">{icon}</span><div><h3>{title}</h3><p>{subtitle}</p></div></div>{action ?? (legend ? <div className="chart-legend">{legend}</div> : null)}</div>{children}</section>;
}

function ChartEmpty() { return <div className="chart-empty"><BarChart3 size={26} /><span>Aún no hay datos suficientes para construir este gráfico.</span></div>; }
