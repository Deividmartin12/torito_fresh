"use client";

import { Droplets } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { dateTime } from "../../../lib/format";

export default function ContainersPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [form, setForm] = useState({ clientId: "", quantity: 0, notes: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [clientData, pendingData, movementData] = await Promise.all([
      api<any[]>("/clients?active=true"),
      api<any[]>("/containers/pending"),
      api<any[]>("/containers/movements"),
    ]);
    setClients(clientData);
    setPending(pendingData);
    setMovements(movementData);
    setForm((current) => ({ ...current, clientId: current.clientId || clientData[0]?.id || "" }));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await api("/containers/adjust", {
        method: "POST",
        body: JSON.stringify({ ...form, quantity: Number(form.quantity) }),
      });
      setMessage("Ajuste registrado");
      setForm({ clientId: clients[0]?.id || "", quantity: 0, notes: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ajustar envases");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Envases retornables</h1>
        <p className="text-sm text-slate-500">Saldo pendiente por cliente y movimientos de entrega/devolucion.</p>
      </div>

      <form onSubmit={submit} className="panel grid gap-3 p-4 md:grid-cols-4">
        <label className="md:col-span-2">
          <span className="label">Cliente</span>
          <select className="control mt-1" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Ajuste (+ debe / - devuelve)</span>
          <input className="control mt-1" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
        </label>
        <label>
          <span className="label">Nota</span>
          <input className="control mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <div className="flex items-end">
          <button className="btn-primary">
            <Droplets size={17} />
            Registrar ajuste
          </button>
        </div>
        {message ? <p className="rounded-md bg-emerald-50 p-2 text-sm font-semibold text-emerald-700 md:col-span-4">{message}</p> : null}
        {error ? <p className="rounded-md bg-rose-50 p-2 text-sm font-semibold text-rose-700 md:col-span-4">{error}</p> : null}
      </form>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Clientes con envases pendientes</h2>
          <span className="text-sm font-semibold text-slate-500">{pending.length} clientes</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefono</th>
                <th>Direccion</th>
                <th>Envases pendientes</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((client) => (
                <tr key={client.id}>
                  <td className="font-semibold">{client.name}</td>
                  <td>{client.phone}</td>
                  <td>{client.address}</td>
                  <td className="font-black text-rose-700">{client.containerBalance}</td>
                </tr>
              ))}
              {!pending.length ? <tr><td colSpan={4} className="text-center text-slate-500">No hay envases pendientes.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-lg font-bold text-ink">Movimientos recientes</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Saldo</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="font-semibold">{movement.client?.name}</td>
                  <td>{dateTime(movement.movedAt)}</td>
                  <td>{movement.type}</td>
                  <td>{movement.quantity}</td>
                  <td>{movement.balanceAfter}</td>
                  <td>{movement.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
