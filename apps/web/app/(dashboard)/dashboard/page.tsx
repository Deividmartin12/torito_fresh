"use client";

import { AlertTriangle, Boxes, Droplets, HandCoins, PackageCheck, Route, ShoppingCart, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { MetricCard } from "../../../components/MetricCard";
import { StatusBadge } from "../../../components/StatusBadge";
import { api } from "../../../lib/api";
import { dateTime, money } from "../../../lib/format";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [dashboard, pending] = await Promise.all([
        api<any>("/reports/dashboard"),
        api<any[]>("/reports/pending-orders"),
      ]);
      setData(dashboard);
      setOrders(pending.slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar dashboard");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <p className="rounded-md bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Dashboard</h1>
        <p className="text-sm text-slate-500">Resumen operativo de ventas, pedidos, deuda, envases y stock.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Ventas del dia" value={money(data?.salesToday)} icon={<ShoppingCart size={20} />} />
        <MetricCard title="Pedidos pendientes" value={data?.pendingOrders ?? 0} icon={<AlertTriangle size={20} />} />
        <MetricCard title="Pedidos en ruta" value={data?.onRouteOrders ?? 0} icon={<Route size={20} />} />
        <MetricCard title="Total de deudas" value={money(data?.totalDebt)} icon={<HandCoins size={20} />} />
        <MetricCard title="Envases pendientes" value={data?.pendingContainers ?? 0} icon={<Droplets size={20} />} />
        <MetricCard title="Vidones llenos" value={data?.fullJugStock ?? 0} icon={<PackageCheck size={20} />} />
        <MetricCard title="Envases vacios" value={data?.emptyContainerStock ?? 0} icon={<Boxes size={20} />} />
        <MetricCard title="Clientes activos" value={data?.activeClients ?? 0} icon={<Users size={20} />} />
      </section>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Pedidos por atender</h2>
          <span className="text-xs font-semibold text-slate-500">{orders.length} visibles</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Total</th>
                <th>Repartidor</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="font-semibold">{order.client?.name}</td>
                  <td>{dateTime(order.orderedAt)}</td>
                  <td><StatusBadge value={order.status} /></td>
                  <td>{money(order.total)}</td>
                  <td>{order.deliveryUser?.name ?? "-"}</td>
                </tr>
              ))}
              {!orders.length ? (
                <tr>
                  <td colSpan={5} className="text-center text-slate-500">No hay pedidos pendientes.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
