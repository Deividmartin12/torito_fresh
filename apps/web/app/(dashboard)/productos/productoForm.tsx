import { PackagePlus, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { categorias, emptyProducto, toPayload, type Producto, type ProductoPayload } from "./types";

type Props = {
  producto?: Producto;
  onSave: (data: ProductoPayload) => Promise<void>;
  onClose: () => void;
};

export function ProductoForm({ producto, onSave, onClose }: Props) {
  const [form, setForm] = useState<ProductoPayload>(producto ? toPayload(producto) : emptyProducto);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave({ ...form, price: Number(form.price), stock: Number(form.stock) });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="panel max-h-[90vh] w-full max-w-3xl overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">{producto ? "Editar producto" : "Agregar producto"}</h2>
          <button className="btn-secondary h-9 w-9 p-0" onClick={onClose} type="button" title="Cerrar"><X size={17} /></button>
        </div>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
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
              {Object.entries(categorias).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
          <div className="flex justify-end gap-2 md:col-span-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary">
              <PackagePlus size={17} />
              {producto ? "Actualizar" : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
