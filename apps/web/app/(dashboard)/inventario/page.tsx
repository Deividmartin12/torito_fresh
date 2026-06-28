"use client";

import { Boxes } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { dateTime, money } from "../../../lib/format";

const movementTypes: Record<string, string> = {
  PRODUCTION_IN: "Entrada por produccion",
  PURCHASE_IN: "Entrada por compra",
  SALE_OUT: "Salida por venta",
  ADJUSTMENT_IN: "Ajuste entrada",
  ADJUSTMENT_OUT: "Ajuste salida",
  RETURN_IN: "Retorno",
};

export default function InventoryPage() {
  const [summary, setSummary] = useState<any>({ products: [], warehouse: {} });
  const [movements, setMovements] = useState<any[]>([]);
  const [form, setForm] = useState({ productId: "", type: "PRODUCTION_IN", quantity: 0, emptyContainersDelta: "", notes: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [summaryData, movementData] = await Promise.all([api<any>("/inventory/summary"), api<any[]>("/inventory/movements")]);
    setSummary(summaryData);
    setMovements(movementData);
    setForm((current) => ({ ...current, productId: current.productId || summaryData.products?.[0]?.id || "" }));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    const payload: any = {
      productId: form.productId || undefined,
      type: form.type,
      quantity: Number(form.quantity),
      notes: form.notes,
    };
    if (form.emptyContainersDelta !== "") {
      payload.emptyContainersDelta = Number(form.emptyContainersDelta);
    }
    try {
      await api("/inventory/movements", { method: "POST", body: JSON.stringify(payload) });
      setMessage("Movimiento registrado");
      setForm({ productId: summary.products?.[0]?.id || "", type: "PRODUCTION_IN", quantity: 0, emptyContainersDelta: "", notes: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar movimiento");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Inventario / Almacen</h1>
        <p className="text-sm text-slate-500">Stock de productos, vidones llenos, envases vacios y movimientos.</p>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Envases vacios</p>
          <p className="mt-2 text-3xl font-black text-ink">{summary.warehouse?.emptyContainers ?? 0}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-soft md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stock total productos</p>
          <p className="mt-2 text-3xl font-black text-ink">{summary.products?.reduce((sum: number, product: any) => sum + product.stock, 0) ?? 0}</p>
        </div>
      </section>

      <form onSubmit={submit} className="panel grid gap-3 p-4 md:grid-cols-5">
        <label className="md:col-span-2">
          <span className="label">Producto</span>
          <select className="control mt-1" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
            <option value="">Solo envases vacios</option>
            {summary.products?.map((product: any) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Tipo</span>
          <select className="control mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(movementTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Cantidad producto</span>
          <input className="control mt-1" type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
        </label>
        <label>
          <span className="label">Delta envases vacios</span>
          <input className="control mt-1" type="number" placeholder="Opcional" value={form.emptyContainersDelta} onChange={(e) => setForm({ ...form, emptyContainersDelta: e.target.value })} />
        </label>
        <label className="md:col-span-4">
          <span className="label">Nota</span>
          <input className="control mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <div className="flex items-end">
          <button className="btn-primary">
            <Boxes size={17} />
            Registrar
          </button>
        </div>
        {message ? <p className="rounded-md bg-emerald-50 p-2 text-sm font-semibold text-emerald-700 md:col-span-5">{message}</p> : null}
        {error ? <p className="rounded-md bg-rose-50 p-2 text-sm font-semibold text-rose-700 md:col-span-5">{error}</p> : null}
      </form>

      <section className="panel p-4">
        <h2 className="mb-3 text-lg font-bold text-ink">Stock actual</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoria</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Retornable</th>
              </tr>
            </thead>
            <tbody>
              {summary.products?.map((product: any) => (
                <tr key={product.id}>
                  <td className="font-semibold">{product.name}</td>
                  <td>{product.category}</td>
                  <td>{money(product.price)}</td>
                  <td>{product.stock}</td>
                  <td>{product.returnable ? "Si" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-lg font-bold text-ink">Movimientos</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Stock final</th>
                <th>Envases vacios</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td>{dateTime(movement.movedAt)}</td>
                  <td>{movementTypes[movement.type] ?? movement.type}</td>
                  <td>{movement.product?.name ?? "-"}</td>
                  <td>{movement.quantity}</td>
                  <td>{movement.stockAfter ?? "-"}</td>
                  <td>{movement.emptyContainersAfter ?? "-"}</td>
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
