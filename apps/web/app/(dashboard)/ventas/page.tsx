"use client";

import { ReceiptText } from "lucide-react";
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

export default function SalesPage() {
  const [sales, setSales] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [form, setForm] = useState({ orderId: "", paymentMethod: "CASH", amountPaid: 0 });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [saleData, orderData] = await Promise.all([api<any[]>("/sales"), api<any[]>("/orders?status=DELIVERED")]);
    setSales(saleData);
    const convertible = orderData.filter((order) => !order.sale);
    setOrders(convertible);
    setForm((current) => ({ ...current, orderId: current.orderId || convertible[0]?.id || "" }));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const selectedOrder = useMemo(() => orders.find((order) => order.id === form.orderId), [orders, form.orderId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await api("/sales/from-order", {
        method: "POST",
        body: JSON.stringify({ ...form, amountPaid: Number(form.amountPaid) }),
      });
      setMessage("Venta generada");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar venta");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Ventas</h1>
        <p className="text-sm text-slate-500">Ventas generadas desde pedidos entregados y tickets simples.</p>
      </div>

      <form onSubmit={submit} className="panel grid gap-3 p-4 md:grid-cols-4">
        <label className="md:col-span-2">
          <span className="label">Pedido entregado sin venta</span>
          <select className="control mt-1" value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })}>
            <option value="">No hay pedidos disponibles</option>
            {orders.map((order) => <option key={order.id} value={order.id}>{order.client?.name} - {money(order.total)}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Metodo</span>
          <select className="control mt-1" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
            {Object.entries(methods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Monto pagado</span>
          <input className="control mt-1" type="number" min="0" step="0.01" max={Number(selectedOrder?.total ?? 0)} value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: Number(e.target.value) })} />
        </label>
        <div className="flex items-end">
          <button className="btn-primary" disabled={!form.orderId}>
            <ReceiptText size={17} />
            Generar venta
          </button>
        </div>
        {selectedOrder ? <p className="text-sm font-semibold text-slate-600 md:col-span-3">Total del pedido: {money(selectedOrder.total)}</p> : null}
        {message ? <p className="rounded-md bg-emerald-50 p-2 text-sm font-semibold text-emerald-700 md:col-span-4">{message}</p> : null}
        {error ? <p className="rounded-md bg-rose-50 p-2 text-sm font-semibold text-rose-700 md:col-span-4">{error}</p> : null}
      </form>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Historial de ventas</h2>
          <span className="text-sm font-semibold text-slate-500">{sales.length} ventas</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Deuda</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="font-semibold">{sale.ticketNumber}</td>
                  <td>{sale.client?.name}</td>
                  <td>{dateTime(sale.issuedAt)}</td>
                  <td>{money(sale.totalAmount)}</td>
                  <td>{money(sale.paidAmount)}</td>
                  <td>{money(sale.debtAmount)}</td>
                  <td><StatusBadge value={sale.paymentStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
