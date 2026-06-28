"use client";

import { AlertTriangle, BarChart3, Boxes, Droplets, HandCoins, Package, Route, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { MetricCard } from "../../../components/MetricCard";
import { StatusBadge } from "../../../components/StatusBadge";
import { api } from "../../../lib/api";
import { money, shortDate } from "../../../lib/format";

export default function ReportsPage() {
  const [dashboard, setDashboard] = useState<any>({});
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [containers, setContainers] = useState<any[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [salesByDelivery, setSalesByDelivery] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const [dash, salesData, productData, clientData, debtData, containerData, pendingData, deliveryData] = await Promise.all([
      api<any>("/reports/dashboard"),
      api<any[]>("/reports/sales"),
      api<any[]>("/reports/top-products"),
      api<any[]>("/reports/frequent-clients"),
      api<any[]>("/reports/debts"),
      api<any[]>("/reports/containers-pending"),
      api<any[]>("/reports/pending-orders"),
      api<any[]>("/reports/sales-by-delivery"),
    ]);
    setDashboard(dash);
    setSales(salesData);
    setProducts(productData);
    setClients(clientData);
    setDebts(debtData);
    setContainers(containerData);
    setPendingOrders(pendingData);
    setSalesByDelivery(deliveryData);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="rounded-md bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Reportes</h1>
        <p className="text-sm text-slate-500">Ventas, productos, clientes, deudas, envases, pedidos y stock actual.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Ventas del dia" value={money(dashboard.salesToday)} icon={<BarChart3 size={20} />} />
        <MetricCard title="Deuda total" value={money(dashboard.totalDebt)} icon={<HandCoins size={20} />} />
        <MetricCard title="Envases pendientes" value={dashboard.pendingContainers ?? 0} icon={<Droplets size={20} />} />
        <MetricCard title="Pedidos pendientes" value={dashboard.pendingOrders ?? 0} icon={<AlertTriangle size={20} />} />
        <MetricCard title="Pedidos en ruta" value={dashboard.onRouteOrders ?? 0} icon={<Route size={20} />} />
        <MetricCard title="Vidones llenos" value={dashboard.fullJugStock ?? 0} icon={<Package size={20} />} />
        <MetricCard title="Envases vacios" value={dashboard.emptyContainerStock ?? 0} icon={<Boxes size={20} />} />
        <MetricCard title="Clientes activos" value={dashboard.activeClients ?? 0} icon={<Users size={20} />} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <ReportTable title="Ventas por dia" headers={["Dia", "Ventas", "Pagado", "Deuda", "Tickets"]}>
          {sales.map((row) => (
            <tr key={row.date}>
              <td>{shortDate(row.date)}</td>
              <td>{money(row.total)}</td>
              <td>{money(row.paid)}</td>
              <td>{money(row.debt)}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </ReportTable>

        <ReportTable title="Productos mas vendidos" headers={["Producto", "Cantidad", "Total"]}>
          {products.map((row) => (
            <tr key={row.product?.id ?? row.product?.name}>
              <td className="font-semibold">{row.product?.name}</td>
              <td>{row.quantity}</td>
              <td>{money(row.total)}</td>
            </tr>
          ))}
        </ReportTable>

        <ReportTable title="Clientes frecuentes" headers={["Cliente", "Pedidos", "Total"]}>
          {clients.map((row) => (
            <tr key={row.client?.id ?? row.client?.name}>
              <td className="font-semibold">{row.client?.name}</td>
              <td>{row.orders}</td>
              <td>{money(row.total)}</td>
            </tr>
          ))}
        </ReportTable>

        <ReportTable title="Ventas por repartidor" headers={["Repartidor", "Ventas", "Total"]}>
          {salesByDelivery.map((row) => (
            <tr key={row.repartidor}>
              <td className="font-semibold">{row.repartidor}</td>
              <td>{row.count}</td>
              <td>{money(row.total)}</td>
            </tr>
          ))}
        </ReportTable>

        <ReportTable title="Clientes con deuda" headers={["Cliente", "Telefono", "Deuda"]}>
          {debts.map((client) => (
            <tr key={client.id}>
              <td className="font-semibold">{client.name}</td>
              <td>{client.phone}</td>
              <td>{money(client.debtBalance)}</td>
            </tr>
          ))}
        </ReportTable>

        <ReportTable title="Clientes con envases pendientes" headers={["Cliente", "Telefono", "Envases"]}>
          {containers.map((client) => (
            <tr key={client.id}>
              <td className="font-semibold">{client.name}</td>
              <td>{client.phone}</td>
              <td>{client.containerBalance}</td>
            </tr>
          ))}
        </ReportTable>
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-lg font-bold text-ink">Pedidos pendientes</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Total</th>
                <th>Repartidor</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map((order) => (
                <tr key={order.id}>
                  <td className="font-semibold">{order.client?.name}</td>
                  <td><StatusBadge value={order.status} /></td>
                  <td>{money(order.total)}</td>
                  <td>{order.deliveryUser?.name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReportTable({ title, headers, children }: { title: string; headers: string[]; children: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="mb-3 text-lg font-bold text-ink">{title}</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}
