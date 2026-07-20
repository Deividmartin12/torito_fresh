"use client";

import { Pencil, Plus, Search, ShieldCheck, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const trabajadores = [
  { id: 1, documento: "45889910", nombres: "Carlos Medina", cargo: "Almacenero", telefono: "955210320", correo: "cmedina@toritofresh.pe", sede: "Almacen principal", activo: true },
  { id: 2, documento: "42100234", nombres: "Rosa Salazar", cargo: "Administrador", telefono: "988001450", correo: "rsalazar@toritofresh.pe", sede: "Oficina", activo: true },
  { id: 3, documento: "48077210", nombres: "Luis Torres", cargo: "Repartidor", telefono: "922440018", correo: "ltorres@toritofresh.pe", sede: "Vehiculo 01", activo: true },
];

export default function TrabajadoresPage() {
  const [buscar, setBuscar] = useState(""); const [modal, setModal] = useState(false); const [editando, setEditando] = useState<(typeof trabajadores)[number] | null>(null);
  const visibles = useMemo(() => trabajadores.filter((item) => `${item.nombres} ${item.documento} ${item.cargo}`.toLowerCase().includes(buscar.toLowerCase())), [buscar]);
  function abrir(item?: (typeof trabajadores)[number]) { setEditando(item ?? null); setModal(true); } function guardar(event: FormEvent) { event.preventDefault(); setModal(false); }
  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Trabajadores</h1><span>{trabajadores.length} trabajadores</span></div><button className="round-add" onClick={() => abrir()} title="Agregar trabajador" aria-label="Agregar trabajador"><Plus size={20} /></button></div>
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar por nombre, documento o cargo" /></label></div>
    <div className="glass-table"><table><thead><tr><th>Trabajador</th><th>Cargo</th><th>Contacto</th><th>Asignacion</th><th>Acceso</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visibles.map((item) => <tr key={item.id}><td><strong>{item.nombres}</strong><small>DNI {item.documento}</small></td><td>{item.cargo}</td><td>{item.telefono}<small>{item.correo}</small></td><td>{item.sede}</td><td><span className="status status-blue">Habilitado</span></td><td><span className="status status-green">Activo</span></td><td><div className="row-actions"><button className="icon-soft" onClick={() => abrir(item)} title="Editar trabajador"><Pencil size={16} /></button><button className="icon-soft" title="Gestionar acceso"><ShieldCheck size={16} /></button></div></td></tr>)}</tbody></table></div>
    {modal ? <div className="modal-backdrop"><section className="crud-modal" role="dialog" aria-modal="true" aria-label={editando ? "Editar trabajador" : "Agregar trabajador"}><div className="modal-top"><h2>{editando ? "Editar trabajador" : "Agregar trabajador"}</h2><button className="modal-close" onClick={() => setModal(false)} aria-label="Cerrar modal"><X size={18} /></button></div><form className="modal-form" onSubmit={guardar}>
      <label><span>Tipo de documento</span><select><option>DNI</option><option>CE</option></select></label><label><span>Numero de documento</span><input defaultValue={editando?.documento} required /></label><label><span>Nombres y apellidos</span><input defaultValue={editando?.nombres} required /></label><label><span>Cargo</span><select defaultValue={editando?.cargo}><option>Administrador</option><option>Almacenero</option><option>Vendedor</option><option>Repartidor</option></select></label><label><span>Telefono</span><input defaultValue={editando?.telefono} /></label><label><span>Correo</span><input type="email" defaultValue={editando?.correo} /></label>
      <div className="modal-actions"><button className="btn-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary">{editando ? "Guardar cambios" : "Registrar trabajador"}</button></div>
    </form></section></div> : null}
  </div>;
}
