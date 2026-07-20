"use client";

import { Building2, Pencil, Plus, Search, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type Proveedor = { id: number; razon: string; ruc: string; comercial: string; telefono: string; correo: string; compras: number; saldo: number; activo: boolean };
const datos: Proveedor[] = [
  { id: 1, razon: "Aguas del Norte S.A.C.", ruc: "20601234567", comercial: "Aguas del Norte", telefono: "945220110", correo: "ventas@aguasnorte.pe", compras: 12, saldo: 950, activo: true },
  { id: 2, razon: "Envases Peruanos E.I.R.L.", ruc: "20509876543", comercial: "EnvaPeru", telefono: "936445580", correo: "pedidos@envaperu.pe", compras: 8, saldo: 720, activo: true },
  { id: 3, razon: "Suministros Lima S.A.", ruc: "20405123456", comercial: "SumiLima", telefono: "901330022", correo: "contacto@sumilima.pe", compras: 4, saldo: 0, activo: false },
];

export default function ProveedoresPage() {
  const [buscar, setBuscar] = useState(""); const [modal, setModal] = useState(false); const [editando, setEditando] = useState<Proveedor | null>(null);
  const proveedores = useMemo(() => datos.filter((item) => `${item.razon} ${item.ruc} ${item.comercial}`.toLowerCase().includes(buscar.toLowerCase())), [buscar]);
  function abrir(item?: Proveedor) { setEditando(item ?? null); setModal(true); }
  function guardar(event: FormEvent) { event.preventDefault(); setModal(false); }
  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Proveedores</h1><span>{datos.length} proveedores</span></div><button className="round-add" onClick={() => abrir()} title="Agregar proveedor" aria-label="Agregar proveedor"><Plus size={20} /></button></div>
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar por razon social, RUC o nombre comercial" /></label></div>
    <div className="glass-table"><table><thead><tr><th>Proveedor</th><th>Contacto</th><th>Compras</th><th>Saldo pendiente</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{proveedores.map((item) => <tr key={item.id}><td><strong>{item.razon}</strong><small>{item.ruc} · {item.comercial}</small></td><td>{item.telefono}<small>{item.correo}</small></td><td>{item.compras}</td><td>S/ {item.saldo.toFixed(2)}</td><td><span className={item.activo ? "status status-green" : "status status-red"}>{item.activo ? "Activo" : "Inactivo"}</span></td><td><div className="row-actions"><button className="icon-soft" onClick={() => abrir(item)} title="Editar proveedor"><Pencil size={16} /></button><button className="icon-soft" title="Ver compras"><Building2 size={16} /></button></div></td></tr>)}</tbody></table></div>
    {modal ? <div className="modal-backdrop"><section className="crud-modal" role="dialog" aria-modal="true" aria-label={editando ? "Editar proveedor" : "Agregar proveedor"}><div className="modal-top"><h2>{editando ? "Editar proveedor" : "Agregar proveedor"}</h2><button className="modal-close" onClick={() => setModal(false)} aria-label="Cerrar modal"><X size={18} /></button></div><form className="modal-form" onSubmit={guardar}>
      <label><span>RUC</span><input defaultValue={editando?.ruc} required /></label><label><span>Razon social</span><input defaultValue={editando?.razon} required /></label><label><span>Nombre comercial</span><input defaultValue={editando?.comercial} /></label><label><span>Telefono</span><input defaultValue={editando?.telefono} /></label><label><span>Correo</span><input type="email" defaultValue={editando?.correo} /></label><label><span>Direccion</span><input /></label>
      <div className="modal-actions"><button className="btn-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary">{editando ? "Guardar cambios" : "Registrar proveedor"}</button></div>
    </form></section></div> : null}
  </div>;
}
