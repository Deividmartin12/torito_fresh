"use client";

import { PackagePlus, Search } from "lucide-react";
import { useState } from "react";
import { ProductoForm } from "./productoForm";
import { ProductosTable } from "./productosTable";
import type { Producto } from "./types";
import { useProductos } from "./useProductos";

export default function ProductosPage() {
  const { productos, search, setSearch, error, message, load, save, deactivate } = useProductos();
  const [editingProducto, setEditingProducto] = useState<Producto | undefined>();
  const [isOpen, setIsOpen] = useState(false);

  function openEdit(producto: Producto) {
    setEditingProducto(producto);
    setIsOpen(true);
  }

  function openCreate() {
    setEditingProducto(undefined);
    setIsOpen(true);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Productos</h1>
        <p className="text-sm text-slate-500">Precios, stock y estado de vidones, bidones, dispensadores y otros productos.</p>
      </div>

      <section className="panel p-4">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-md flex-1 gap-2">
            <input className="control" placeholder="Buscar producto o SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn-secondary" onClick={() => load()} title="Buscar" type="button"><Search size={17} /></button>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-slate-500">{productos.length} productos</div>
            <button className="btn-primary" onClick={openCreate} type="button">
              <PackagePlus size={17} />
              Agregar
            </button>
          </div>
        </div>
        {message ? <p className="mb-3 rounded-md bg-emerald-50 p-2 text-sm font-semibold text-emerald-700">{message}</p> : null}
        {error ? <p className="mb-3 rounded-md bg-rose-50 p-2 text-sm font-semibold text-rose-700">{error}</p> : null}
        <ProductosTable productos={productos} onEdit={openEdit} onDeactivate={deactivate} />
      </section>

      {isOpen ? (
        <ProductoForm
          producto={editingProducto}
          onSave={(data) => save(data, editingProducto?.id)}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </div>
  );
}
