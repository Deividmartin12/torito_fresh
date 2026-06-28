"use client";

import { HandCoins } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { StatusBadge } from "../../../components/StatusBadge";
import { api } from "../../../lib/api";
import { dateTime, money } from "../../../lib/format";

const methods: Record<string, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  TRANSFER: "Transferencia",
};

export default function CollectionsPage() {
  const [debts, setDebts] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [form, setForm] = useState({ saleId: "", amount: 0, method: "CASH", notes: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [debtData, paymentData] = await Promise.all([api<any[]>("/payments/debts"), api<any[]>("/payments")]);
    setDebts(debtData);
    setPayments(paymentData.slice(0, 20));
    setForm((current) => ({ ...current, saleId: current.saleId || debtData[0]?.id || "", amount: current.amount || Number(debtData[0]?.debtAmount ?? 0) }));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api("/payments", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      setMessage("Pago registrado");
      setForm({ saleId: "", amount: 0, method: "CASH", notes: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar pago");
    }
  }

  const selected = debts.find((sale) => sale.id === form.saleId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Cobranzas</h1>
        <p className="text-sm text-slate-500">Clientes con deuda, pagos parciales e historial de cobros.</p>
      </div>

      <form onSubmit={submit} className="panel grid gap-3 p-4 md:grid-cols-4">
        <label className="md:col-span-2">
          <span className="label">Venta pendiente</span>
          <select className="control mt-1" value={form.saleId} onChange={(e) => {
            const sale = debts.find((item) => item.id === e.target.value);
            setForm({ ...form, saleId: e.target.value, amount: Number(sale?.debtAmount ?? 0) });
          }}>
            <option value="">No hay deudas</option>
            {debts.map((sale) => <option key={sale.id} value={sale.id}>{sale.client?.name} - {sale.ticketNumber} - {money(sale.debtAmount)}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Metodo</span>
          <select className="control mt-1" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {Object.entries(methods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Monto</span>
          <input className="control mt-1" type="number" min="0.01" step="0.01" max={Number(selected?.debtAmount ?? 0)} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
        </label>
        <label className="md:col-span-3">
          <span className="label">Nota</span>
          <input className="control mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <div className="flex items-end">
          <button className="btn-primary" disabled={!form.saleId}>
            <HandCoins size={17} />
            Registrar pago
          </button>
        </div>
        {message ? <p className="rounded-md bg-emerald-50 p-2 text-sm font-semibold text-emerald-700 md:col-span-4">{message}</p> : null}
        {error ? <p className="rounded-md bg-rose-50 p-2 text-sm font-semibold text-rose-700 md:col-span-4">{error}</p> : null}
      </form>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Deudas pendientes</h2>
          <span className="text-sm font-semibold text-slate-500">{debts.length} ventas</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Ticket</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Deuda</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {debts.map((sale) => (
                <tr key={sale.id}>
                  <td className="font-semibold">{sale.client?.name}</td>
                  <td>{sale.ticketNumber}</td>
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

      <section className="panel p-4">
        <h2 className="mb-3 text-lg font-bold text-ink">Ultimos pagos</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Metodo</th>
                <th>Monto</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="font-semibold">{payment.client?.name}</td>
                  <td>{dateTime(payment.paidAt)}</td>
                  <td>{methods[payment.method] ?? payment.method}</td>
                  <td>{money(payment.amount)}</td>
                  <td>{payment.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
