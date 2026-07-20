"use client";

import { Banknote, CreditCard, Pencil, Plus, Search, Smartphone, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const metodos = [
  { id: 1, nombre: "EFECTIVO", descripcion: "Pago en caja o contra entrega", operacion: false, icono: Banknote, uso: 86, activo: true },
  { id: 2, nombre: "YAPE", descripcion: "Billetera movil", operacion: true, icono: Smartphone, uso: 42, activo: true },
  { id: 3, nombre: "PLIN", descripcion: "Billetera movil", operacion: true, icono: Smartphone, uso: 27, activo: true },
  { id: 4, nombre: "TRANSFERENCIA", descripcion: "Transferencia bancaria", operacion: true, icono: CreditCard, uso: 18, activo: true },
  { id: 5, nombre: "TARJETA", descripcion: "Debito o credito", operacion: true, icono: CreditCard, uso: 11, activo: true },
];

export default function MetodosPagoPage() {
  const [buscar, setBuscar] = useState(""); const [modal, setModal] = useState(false); const [editando, setEditando] = useState<(typeof metodos)[number] | null>(null);
  const visibles = useMemo(() => metodos.filter((item) => `${item.nombre} ${item.descripcion}`.toLowerCase().includes(buscar.toLowerCase())), [buscar]);
  function abrir(item?: (typeof metodos)[number]) { setEditando(item ?? null); setModal(true); } function guardar(event: FormEvent) { event.preventDefault(); setModal(false); }
  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Metodos de pago</h1><span>{metodos.length} metodos</span></div><button className="round-add" onClick={() => abrir()} title="Agregar metodo" aria-label="Agregar metodo"><Plus size={20} /></button></div>
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar metodo de pago" /></label></div>
    <div className="glass-table"><table><thead><tr><th>Metodo</th><th>Descripcion</th><th>Numero de operacion</th><th>Uso este mes</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visibles.map((item) => { const Icon = item.icono; return <tr key={item.id}><td><div className="flex items-center gap-2"><Icon size={18} /><strong>{item.nombre}</strong></div></td><td>{item.descripcion}</td><td>{item.operacion ? "Obligatorio" : "No requerido"}</td><td>{item.uso} pagos</td><td><span className="status status-green">Activo</span></td><td><button className="icon-soft" onClick={() => abrir(item)} title="Editar metodo"><Pencil size={16} /></button></td></tr>; })}</tbody></table></div>
    {modal ? <div className="modal-backdrop"><section className="crud-modal" role="dialog" aria-modal="true" aria-label={editando ? "Editar metodo" : "Agregar metodo"}><div className="modal-top"><h2>{editando ? "Editar metodo de pago" : "Agregar metodo de pago"}</h2><button className="modal-close" onClick={() => setModal(false)} aria-label="Cerrar modal"><X size={18} /></button></div><form className="modal-form" onSubmit={guardar}>
      <label><span>Nombre</span><input defaultValue={editando?.nombre} required /></label><label><span>Descripcion</span><input defaultValue={editando?.descripcion} /></label><label className="check-field field-wide"><input type="checkbox" defaultChecked={editando?.operacion} /><span>Requiere numero de operacion</span></label>
      <div className="modal-actions"><button className="btn-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary">{editando ? "Guardar cambios" : "Registrar metodo"}</button></div>
    </form></section></div> : null}
  </div>;
}
