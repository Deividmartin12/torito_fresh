"use client";

import { Boxes, Pencil, Plus, Search, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type Producto = { id: number; codigo: string; nombre: string; tipo: string; unidad: string; capacidad: string; precio: number; costo: number; stock: number; lote: boolean; retornable: boolean; activo: boolean };
const datos: Producto[] = [
  { id: 1, codigo: "AGUA-20L", nombre: "Agua purificada 20 L", tipo: "Agua", unidad: "Unidad", capacidad: "20 L", precio: 12, costo: 5, stock: 125, lote: true, retornable: false, activo: true },
  { id: 2, codigo: "BIDON-20L", nombre: "Bidon retornable 20 L", tipo: "Bidon", unidad: "Unidad", capacidad: "20 L", precio: 25, costo: 18, stock: 82, lote: false, retornable: true, activo: true },
  { id: 3, codigo: "DISP-MANUAL", nombre: "Dispensador manual", tipo: "Dispensador", unidad: "Unidad", capacidad: "-", precio: 18, costo: 10, stock: 24, lote: false, retornable: false, activo: true },
];

export default function ProductosPage() {
  const [buscar, setBuscar] = useState(""); const [tipo, setTipo] = useState("Todos"); const [modal, setModal] = useState(false); const [editando, setEditando] = useState<Producto | null>(null);
  const productos = useMemo(() => datos.filter((item) => (tipo === "Todos" || item.tipo === tipo) && `${item.codigo} ${item.nombre}`.toLowerCase().includes(buscar.toLowerCase())), [buscar, tipo]);
  function abrir(item?: Producto) { setEditando(item ?? null); setModal(true); }
  function guardar(event: FormEvent) { event.preventDefault(); setModal(false); }
  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Productos</h1><span>{datos.length} productos</span></div><button className="round-add" onClick={() => abrir()} title="Agregar producto" aria-label="Agregar producto"><Plus size={20} /></button></div>
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar por codigo o nombre" /></label><select className="filter-pill" value={tipo} onChange={(event) => setTipo(event.target.value)}><option>Todos</option><option>Agua</option><option>Bidon</option><option>Dispensador</option></select></div>
    <div className="glass-table"><table><thead><tr><th>Producto</th><th>Tipo</th><th>Unidad</th><th>Precio venta</th><th>Costo ref.</th><th>Stock global</th><th>Control</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{productos.map((item) => <tr key={item.id}><td><strong>{item.nombre}</strong><small>{item.codigo} · {item.capacidad}</small></td><td>{item.tipo}</td><td>{item.unidad}</td><td>S/ {item.precio.toFixed(2)}</td><td>S/ {item.costo.toFixed(2)}</td><td>{item.stock}</td><td>{item.lote ? "Lote" : item.retornable ? "Retornable" : "Simple"}</td><td><span className="status status-green">Activo</span></td><td><div className="row-actions"><button className="icon-soft" onClick={() => abrir(item)} title="Editar producto"><Pencil size={16} /></button><button className="icon-soft" title="Ver stock"><Boxes size={16} /></button></div></td></tr>)}</tbody></table></div>
    {modal ? <div className="modal-backdrop"><section className="crud-modal" role="dialog" aria-modal="true" aria-label={editando ? "Editar producto" : "Agregar producto"}><div className="modal-top"><h2>{editando ? "Editar producto" : "Agregar producto"}</h2><button className="modal-close" onClick={() => setModal(false)} aria-label="Cerrar modal"><X size={18} /></button></div><form className="modal-form" onSubmit={guardar}>
      <label><span>Codigo</span><input defaultValue={editando?.codigo} required /></label><label><span>Nombre</span><input defaultValue={editando?.nombre} required /></label><label><span>Tipo de producto</span><select defaultValue={editando?.tipo ?? "Agua"}><option>Agua</option><option>Bidon</option><option>Dispensador</option><option>Accesorio</option><option>Insumo</option></select></label><label><span>Unidad de medida</span><select defaultValue={editando?.unidad ?? "Unidad"}><option>Unidad</option><option>Litro</option><option>Caja</option></select></label><label><span>Precio de venta</span><input type="number" step="0.01" defaultValue={editando?.precio} required /></label><label><span>Costo de referencia</span><input type="number" step="0.01" defaultValue={editando?.costo} required /></label><label className="check-field"><input type="checkbox" defaultChecked={editando?.lote} /><span>Controla lote</span></label><label className="check-field"><input type="checkbox" defaultChecked={editando?.retornable} /><span>Es retornable</span></label>
      <div className="modal-actions"><button className="btn-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary">{editando ? "Guardar cambios" : "Registrar producto"}</button></div>
    </form></section></div> : null}
  </div>;
}
