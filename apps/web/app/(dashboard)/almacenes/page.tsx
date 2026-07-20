"use client";

import { Boxes, Pencil, Plus, Search, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const almacenes = [
  { id: 1, codigo: "ALM-PRINCIPAL", nombre: "Almacen principal", tipo: "PRINCIPAL", direccion: "Av. Industrial 560", responsable: "Carlos Medina", productos: 14, unidades: 209, activo: true },
  { id: 2, codigo: "VEH-01", nombre: "Vehiculo 01", tipo: "VEHICULO", direccion: "Ruta de reparto", responsable: "Luis Torres", productos: 5, unidades: 36, activo: true },
  { id: 3, codigo: "PLANTA-01", nombre: "Planta de produccion", tipo: "PLANTA", direccion: "Km 12 Carretera Norte", responsable: "Rosa Salazar", productos: 7, unidades: 118, activo: true },
];

export default function AlmacenesPage() {
  const [buscar, setBuscar] = useState(""); const [modal, setModal] = useState(false); const [editando, setEditando] = useState<(typeof almacenes)[number] | null>(null);
  const visibles = useMemo(() => almacenes.filter((item) => `${item.codigo} ${item.nombre} ${item.responsable}`.toLowerCase().includes(buscar.toLowerCase())), [buscar]);
  function abrir(item?: (typeof almacenes)[number]) { setEditando(item ?? null); setModal(true); } function guardar(event: FormEvent) { event.preventDefault(); setModal(false); }
  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Almacenes</h1><span>{almacenes.length} almacenes</span></div><button className="round-add" onClick={() => abrir()} title="Agregar almacen" aria-label="Agregar almacen"><Plus size={20} /></button></div>
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar por codigo, nombre o responsable" /></label></div>
    <div className="glass-table"><table><thead><tr><th>Almacen</th><th>Tipo</th><th>Direccion</th><th>Responsable</th><th>Productos</th><th>Unidades</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visibles.map((item) => <tr key={item.id}><td><strong>{item.nombre}</strong><small>{item.codigo}</small></td><td>{item.tipo}</td><td>{item.direccion}</td><td>{item.responsable}</td><td>{item.productos}</td><td>{item.unidades}</td><td><span className="status status-green">Activo</span></td><td><div className="row-actions"><button className="icon-soft" onClick={() => abrir(item)} title="Editar almacen"><Pencil size={16} /></button><button className="icon-soft" title="Ver stock"><Boxes size={16} /></button></div></td></tr>)}</tbody></table></div>
    {modal ? <div className="modal-backdrop"><section className="crud-modal" role="dialog" aria-modal="true" aria-label={editando ? "Editar almacen" : "Agregar almacen"}><div className="modal-top"><h2>{editando ? "Editar almacen" : "Agregar almacen"}</h2><button className="modal-close" onClick={() => setModal(false)} aria-label="Cerrar modal"><X size={18} /></button></div><form className="modal-form" onSubmit={guardar}>
      <label><span>Codigo</span><input defaultValue={editando?.codigo} required /></label><label><span>Nombre</span><input defaultValue={editando?.nombre} required /></label><label><span>Tipo</span><select defaultValue={editando?.tipo}><option>PRINCIPAL</option><option>SECUNDARIO</option><option>VEHICULO</option><option>PLANTA</option></select></label><label><span>Responsable</span><select defaultValue={editando?.responsable}><option>Carlos Medina</option><option>Rosa Salazar</option><option>Luis Torres</option></select></label><label className="field-wide"><span>Direccion</span><input defaultValue={editando?.direccion} /></label>
      <div className="modal-actions"><button className="btn-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary">{editando ? "Guardar cambios" : "Registrar almacen"}</button></div>
    </form></section></div> : null}
  </div>;
}
