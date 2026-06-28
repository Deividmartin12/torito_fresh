"use client";

import { PackagePlus, Pencil, Search, ToggleLeft } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ConfirmButton } from "../../../components/ConfirmButton";
import { StatusBadge } from "../../../components/StatusBadge";
import { api } from "../../../lib/api";
import { money } from "../../../lib/format";

const emptyProduct = {
  name: "",
  sku: "",
  description: "",
  category: "WATER",
  price: 0,
  stock: 0,
  returnable: false,
};

const categories: Record<string, string> = {
  WATER: "Agua",
  DISPENSER: "Dispensador",
  ACCESSORY: "Accesorio",
  OTHER: "Otro",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState<any>(emptyProduct);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    setProducts(await api<any[]>(`/products${params}`));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const payload = { ...form, price: Number(form.price), stock: Number(form.stock) };
    try {
      if (editingId) {
        await api(`/products/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setMessage("Producto actualizado");
      } else {
        await api("/products", { method: "POST", body: JSON.stringify(payload) });
        setMessage("Producto registrado");
      }
      setForm(emptyProduct);
      setEditingId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  function edit(product: any) {
    setEditingId(product.id);
    setForm({
      name: product.name ?? "",
      sku: product.sku ?? "",
      description: product.description ?? "",
      category: product.category ?? "WATER",
      price: Number(product.price ?? 0),
      stock: Number(product.stock ?? 0),
      returnable: Boolean(product.returnable),
    });
  }

  async function deactivate(id: string) {
    await api(`/products/${id}/deactivate`, { method: "PATCH" });
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Productos</h1>
        <p className="text-sm text-slate-500">Precios, stock y estado de vidones, bidones, dispensadores y otros productos.</p>
      </div>

      <form onSubmit={submit} className="panel grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className="label">Producto</span>
          <input className="control mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          <span className="label">SKU</span>
          <input className="control mt-1" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </label>
        <label>
          <span className="label">Categoria</span>
          <select className="control mt-1" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Precio</span>
          <input className="control mt-1" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
        </label>
        <label>
          <span className="label">Stock actual</span>
          <input className="control mt-1" type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input type="checkbox" checked={form.returnable} onChange={(e) => setForm({ ...form, returnable: e.target.checked })} />
          <span className="text-sm font-semibold text-slate-700">Usa envase retornable</span>
        </label>
        <label className="md:col-span-2">
          <span className="label">Descripcion</span>
          <input className="control mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="flex items-end gap-2 xl:col-span-4">
          <button className="btn-primary">
            <PackagePlus size={17} />
            {editingId ? "Actualizar" : "Registrar"}
          </button>
          {editingId ? <button type="button" className="btn-secondary" onClick={() => { setEditingId(""); setForm(emptyProduct); }}>Cancelar edicion</button> : null}
        </div>
      </form>

      <section className="panel p-4">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-md flex-1 gap-2">
            <input className="control" placeholder="Buscar producto o SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn-secondary" onClick={() => load()} title="Buscar"><Search size={17} /></button>
          </div>
          <div className="text-sm font-semibold text-slate-500">{products.length} productos</div>
        </div>
        {message ? <p className="mb-3 rounded-md bg-emerald-50 p-2 text-sm font-semibold text-emerald-700">{message}</p> : null}
        {error ? <p className="mb-3 rounded-md bg-rose-50 p-2 text-sm font-semibold text-rose-700">{error}</p> : null}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoria</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Retornable</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="font-semibold">{product.name}<p className="text-xs text-slate-500">{product.sku || "Sin SKU"}</p></td>
                  <td>{categories[product.category] ?? product.category}</td>
                  <td>{money(product.price)}</td>
                  <td>{product.stock}</td>
                  <td>{product.returnable ? "Si" : "No"}</td>
                  <td><StatusBadge value={product.active ? "ACTIVE" : "INACTIVE"} /></td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary" onClick={() => edit(product)} title="Editar"><Pencil size={16} /></button>
                      {product.active ? (
                        <ConfirmButton className="btn-secondary" message="Desea desactivar este producto?" onConfirm={() => deactivate(product.id)}>
                          <ToggleLeft size={16} />
                        </ConfirmButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
