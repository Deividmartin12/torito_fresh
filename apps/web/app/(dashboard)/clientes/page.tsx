"use client";

import { Pencil, Plus, Search, UserX, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type Cliente = { id: number; nombre: string; documento: string; telefono: string; direccion: string; tipo: string; deuda: number; envases: number; activo: boolean };

const clientesIniciales: Cliente[] = [
  { id: 1, nombre: "Juan Perez", documento: "45871236", telefono: "987654321", direccion: "Av. Los Olivos 123", tipo: "Hogar", deuda: 0, envases: 0, activo: true },
  { id: 2, nombre: "Restaurante El Buen Sabor", documento: "20600123456", telefono: "955222111", direccion: "Jr. Comercio 450", tipo: "Restaurante", deuda: 180, envases: 1, activo: true },
  { id: 3, nombre: "Minimarket La Esquina", documento: "10456789123", telefono: "944333222", direccion: "Calle Central 890", tipo: "Tienda", deuda: 360, envases: 1, activo: true },
];

export default function ClientesPage() {
  const [clientes, setClientes] = useState(clientesIniciales);
  const [buscar, setBuscar] = useState("");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const visibles = useMemo(() => clientes.filter((cliente) => `${cliente.nombre} ${cliente.documento} ${cliente.telefono}`.toLowerCase().includes(buscar.toLowerCase())), [buscar, clientes]);

  function abrir(cliente?: Cliente) { setEditando(cliente ?? null); setModal(true); }
  function guardar(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setModal(false); }
  function desactivar(id: number) { setClientes((actuales) => actuales.map((cliente) => cliente.id === id ? { ...cliente, activo: false } : cliente)); }

  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Clientes</h1><span>{clientes.length} clientes</span></div><button className="round-add" onClick={() => abrir()} title="Agregar cliente" aria-label="Agregar cliente"><Plus size={20} /></button></div>
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar por nombre, documento o telefono" /></label></div>
    <div className="glass-table"><table><thead><tr><th>Cliente</th><th>Contacto</th><th>Tipo</th><th>Deuda</th><th>Envases</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {visibles.map((cliente) => <tr key={cliente.id}><td><strong>{cliente.nombre}</strong><small>{cliente.documento}</small></td><td>{cliente.telefono}<small>{cliente.direccion}</small></td><td>{cliente.tipo}</td><td>S/ {cliente.deuda.toFixed(2)}</td><td>{cliente.envases}</td><td><span className={cliente.activo ? "status status-green" : "status status-red"}>{cliente.activo ? "Activo" : "Inactivo"}</span></td><td><div className="row-actions"><button className="icon-soft" onClick={() => abrir(cliente)} title="Editar cliente"><Pencil size={16} /></button>{cliente.activo ? <button className="icon-soft" onClick={() => desactivar(cliente.id)} title="Desactivar cliente"><UserX size={16} /></button> : null}</div></td></tr>)}
    </tbody></table></div>
    {modal ? <div className="modal-backdrop"><section className="crud-modal" role="dialog" aria-modal="true" aria-label={editando ? "Editar cliente" : "Agregar cliente"}><div className="modal-top"><h2>{editando ? "Editar cliente" : "Agregar cliente"}</h2><button className="modal-close" onClick={() => setModal(false)} aria-label="Cerrar modal"><X size={18} /></button></div><form className="modal-form" onSubmit={guardar}>
      <label><span>Tipo de documento</span><select defaultValue="DNI"><option>DNI</option><option>RUC</option><option>CE</option></select></label>
      <label><span>Numero de documento</span><input defaultValue={editando?.documento} required /></label>
      <label><span>Nombre legal</span><input defaultValue={editando?.nombre} required /></label>
      <label><span>Telefono</span><input defaultValue={editando?.telefono} required /></label>
      <label className="field-wide"><span>Direccion</span><input defaultValue={editando?.direccion} required /></label>
      <label><span>Tipo de cliente</span><select defaultValue={editando?.tipo ?? "Hogar"}><option>Hogar</option><option>Empresa</option><option>Tienda</option><option>Restaurante</option></select></label>
      <label><span>Limite de credito</span><input type="number" defaultValue="0" /></label>
      <div className="modal-actions"><button className="btn-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary">{editando ? "Guardar cambios" : "Registrar cliente"}</button></div>
    </form></section></div> : null}
  </div>;
}
