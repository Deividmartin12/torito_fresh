"use client";

import { AlertTriangle, ArrowRight, Boxes, CircleDollarSign, ClipboardList, Droplets, Factory, PackageCheck, RefreshCw, Route, ShoppingCart, Truck, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "../../../components/StatusBadge";
import { ProductRankingChart } from "../../../components/charts/BusinessCharts";
import { ComparisonBarChart, MarginChart, RankingBarChart } from "../../../components/charts/AnalyticsCharts";
import { BusinessDashboard, getBusinessDashboard } from "../../../lib/dashboard";
import { dateTime, money } from "../../../lib/format";

export default function DashboardPage() {
  const [data, setData] = useState<BusinessDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await getBusinessDashboard()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar el resumen del negocio"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const metrics = data?.metrics;
  const analytics = data?.analytics;
  const nextOrders = data?.pendingOrders.slice(0, 6) ?? [];
  const containerClients = data?.containers.slice(0, 5) ?? [];

  return <div className="module-page business-dashboard">
    <div className="dashboard-head"><div><span className="operation-eyebrow">Centro de operaciones</span><h1>Resumen del negocio</h1><p>Producción, inventario, distribución, cobranza y ciclo de envases para tomar decisiones hoy.</p></div><button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "dashboard-spinning" : ""} /> Actualizar</button></div>

    {error ? <div className="notice-error" role="alert">{error}<button type="button" onClick={() => void load()}>Reintentar</button></div> : null}
    {loading && !data ? <div className="dashboard-loading" role="status"><span className="loading-spinner" /> Preparando indicadores del negocio...</div> : null}

    {data ? <>
      <section className="dashboard-kpis" aria-label="Indicadores principales">
        <DashboardKpi icon={<CircleDollarSign size={21} />} label="Ventas" value={money(analytics?.summary.sales)} detail={`${analytics?.summary.orders ?? 0} operaciones · últimos 12 meses`} tone="blue" />
        <DashboardKpi icon={<Truck size={21} />} label="Gastos" value={money(analytics?.summary.expenses)} detail="Egresos registrados" tone="amber" />
        <DashboardKpi icon={<PackageCheck size={21} />} label="Margen bruto" value={money(analytics?.summary.margin)} detail={`${(analytics?.summary.marginRate ?? 0).toFixed(1)}% sobre ventas`} tone="green" />
        <DashboardKpi icon={<ShoppingCart size={21} />} label="Ticket promedio" value={money(analytics?.summary.ticket)} detail="Promedio por venta confirmada" tone="violet" />
      </section>

      <section className="dashboard-chart-grid" aria-label="Graficos principales del negocio">
        <ComparisonBarChart data={analytics?.monthly ?? []} />
        <ProductRankingChart data={(analytics?.topProducts ?? []).map((row) => ({ product: { id: row.id, name: row.name }, quantity: row.quantity, total: row.revenue }))} compact />
      </section>

      <section className="dashboard-chart-grid" aria-label="Rentabilidad y zonas">
        <MarginChart data={analytics?.monthly ?? []} />
        <RankingBarChart rows={analytics?.zones ?? []} title="Ventas por zona / dirección" subtitle="Áreas registradas con mayor facturación" icon="zone" />
      </section>

      <section className="dashboard-chart-grid" aria-label="Clientes y gastos principales">
        <RankingBarChart rows={analytics?.topClients ?? []} title="Top clientes" subtitle="Clientes con mayor consumo neto" />
        <RankingBarChart rows={analytics?.expenseCategories ?? []} title="Gastos por categoría" subtitle="Categorías con mayor importe registrado" />
      </section>
    </> : null}
  </div>;
}

function DashboardKpi({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; tone: string }) {
  return <article className={`dashboard-kpi dashboard-kpi-${tone}`}><div>{icon}</div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function PriorityCard({ icon, label, value, description, href, action }: { icon: React.ReactNode; label: string; value: React.ReactNode; description: string; href: string; action: string }) {
  return <article className="priority-card"><div className="priority-card-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><p>{description}</p><Link href={href}>{action} <ArrowRight size={14} /></Link></div></article>;
}

function DashboardEmpty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="dashboard-empty">{icon}<strong>{title}</strong><span>{text}</span></div>;
}
