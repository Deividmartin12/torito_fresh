"use client";

import { CheckCircle2, Route } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "../../../components/StatusBadge";
import { api } from "../../../lib/api";
import { dateTime, money } from "../../../lib/format";

const methods: Record<string, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  TRANSFER: "Transferencia",
  CREDIT: "Credito",
};

export default function DeliveriesPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [form, setForm] = useState({
    orderId: "",
    containersDelivered: 0,
    containersReturned: 0,
    paymentReceived: 0,
    paymentMethod: "CASH",
    observations: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [orderData, deliveryData] = await Promise.all([api<any[]>("/orders"), api<any[]>("/deliveries")]);
    const activeOrders = orderData.filter((order) => ["PENDING", "PREPARING", "ON_ROUTE"].includes(order.status));
    setOrders(activeOrders);
    setDeliveries(deliveryData);
    setForm((current) => ({ ...current, orderId: current.orderId || activeOrders[0]?.id || "" }));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const selected = useMemo(() => orders.find((order) => order.id === form.orderId), [orders, form.orderId]);

  useEffect(() => {
    if (selected) {
      const delivered = selected.items?.reduce((sum: number, item: any) => sum + (item.product?.returnable ? item.quantity : 0), 0) ?? 0;
      setForm((current) => ({ ...current, containersDelivered: delivered, paymentReceived: Number(selected.total ?? 0) }));
    }
  }, [selected?.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await api("/deliveries/complete", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          containersDelivered: Number(form.containersDelivered),
          containersReturned: Number(form.containersReturned),
          paymentReceived: Number(form.paymentReceived),
        }),
      });
      setMessage("Entrega registrada, venta generada y stock actualizado");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar entrega");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Repartos</h1>
        <p className="text-sm text-slate-500">Registrar entregas, envases devueltos, pagos recibidos y observaciones.</p>
      </div>

      <form onSubmit={submit} className="panel grid gap-3 p-4 md:grid-cols-4">
        <label className="md:col-span-2">
          <span className="label">Pedido</span>
          <select className="control mt-1" value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })}>
            <option value="">No hay pedidos por repartir</option>
            {orders.map((order) => <option key={order.id} value={order.id}>{order.client?.name} - {money(order.total)} - {order.status}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Envases llenos entregados</span>
          <input className="control mt-1" type="number" min="0" value={form.containersDelivered} onChange={(e) => setForm({ ...form, containersDelivered: Number(e.target.value) })} />
        </label>
        <label>
          <span className="label">Envases vacios devueltos</span>
          <input className="control mt-1" type="number" min="0" value={form.containersReturned} onChange={(e) => setForm({ ...form, containersReturned: Number(e.target.value) })} />
        </label>
        <label>
          <span className="label">Metodo de pago</span>
          <select className="control mt-1" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
            {Object.entries(methods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Pago recibido</span>
          <input className="control mt-1" type="number" min="0" step="0.01" value={form.paymentReceived} onChange={(e) => setForm({ ...form, paymentReceived: Number(e.target.value) })} />
        </label>
        <label className="md:col-span-2">
          <span className="label">Observaciones</span>
          <input className="control mt-1" value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
        </label>
        <div className="flex items-end">
          <button className="btn-primary" disabled={!form.orderId}>
            <CheckCircle2 size={17} />
            Entregado
          </button>
        </div>
        {selected ? <p className="text-sm font-semibold text-slate-600 md:col-span-3">Total: {money(selected.total)}. Si paga menos, queda deuda automaticamente.</p> : null}
        {message ? <p className="rounded-md bg-emerald-50 p-2 text-sm font-semibold text-emerald-700 md:col-span-4">{message}</p> : null}
        {error ? <p className="rounded-md bg-rose-50 p-2 text-sm font-semibold text-rose-700 md:col-span-4">{error}</p> : null}
      </form>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Pedidos en reparto</h2>
          <Route size={18} className="text-brand-700" />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Direccion</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Repartidor</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="font-semibold">{order.client?.name}</td>
                  <td>{order.client?.address}<p className="text-xs text-slate-500">{order.client?.reference}</p></td>
                  <td>{money(order.total)}</td>
                  <td><StatusBadge value={order.status} /></td>
                  <td>{order.deliveryUser?.name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-lg font-bold text-ink">Entregas registradas</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Entregados</th>
                <th>Devueltos</th>
                <th>Pago</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="font-semibold">{delivery.order?.client?.name}</td>
                  <td>{dateTime(delivery.deliveredAt)}</td>
                  <td>{delivery.containersDelivered}</td>
                  <td>{delivery.containersReturned}</td>
                  <td>{money(delivery.paymentReceived)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
