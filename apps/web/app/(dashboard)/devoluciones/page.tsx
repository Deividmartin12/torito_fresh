"use client";

import { Eye, Plus, Search, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const devoluciones = [
  { id: 1, referencia: "DEV-V-0018", fecha: "11/07/2026", tipo: "VENTA", origen: "B001-000341", tercero: "Juan Perez", motivo: "Producto con sello danado", unidades: 1, total: 12, destino: "CUARENTENA", estado: "CONFIRMADA" },
  { id: 2, referencia: "DEV-C-0006", fecha: "09/07/2026", tipo: "COMPRA", origen: "F004-00821", tercero: "Envases Peruanos E.I.R.L.", motivo: "Envases defectuosos", unidades: 5, total: 90, destino: "DEVOLUCION", estado: "BORRADOR" },
];

export default function DevolucionesPage() {
  const [buscar, setBuscar] = useState(""); const [tipo, setTipo] = useState("Todas"); const [modal, setModal] = useState(false); const [seleccionada, setSeleccionada] = useState<(typeof devoluciones)[number] | null>(null);
  const visibles = useMemo(() => devoluciones.filter((item) => (tipo === "Todas" || item.tipo === tipo) && `${item.referencia} ${item.origen} ${item.tercero}`.toLowerCase().includes(buscar.toLowerCase())), [buscar, tipo]);
  function guardar(event: FormEvent) { event.preventDefault(); setModal(false); }
  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Devoluciones</h1><span>{devoluciones.length} devoluciones</span></div><button className="round-add" onClick={() => { setSeleccionada(null); setModal(true); }} title="Registrar devolucion" aria-label="Registrar devolucion"><Plus size={20} /></button></div>
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar referencia, comprobante o tercero" /></label><select className="filter-pill" value={tipo} onChange={(event) => setTipo(event.target.value)}><option>Todas</option><option>VENTA</option><option>COMPRA</option></select></div>
    <div className="glass-table"><table><thead><tr><th>Devolucion</th><th>Tipo</th><th>Origen</th><th>Cliente / Proveedor</th><th>Motivo</th><th>Unidades</th><th>Destino</th><th>Total</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>{visibles.map((item) => <tr key={item.id}><td><strong>{item.referencia}</strong><small>{item.fecha}</small></td><td><span className="status status-blue">{item.tipo}</span></td><td>{item.origen}</td><td>{item.tercero}</td><td>{item.motivo}</td><td>{item.unidades}</td><td>{item.destino}</td><td>S/ {item.total.toFixed(2)}</td><td><span className={item.estado === "CONFIRMADA" ? "status status-green" : "status status-amber"}>{item.estado}</span></td><td><button className="icon-soft" onClick={() => { setSeleccionada(item); setModal(true); }} title="Ver devolucion"><Eye size={16} /></button></td></tr>)}</tbody></table></div>
    {modal ? <div className="modal-backdrop"><section className="crud-modal" role="dialog" aria-modal="true" aria-label={seleccionada ? "Detalle de devolucion" : "Registrar devolucion"}><div className="modal-top"><h2>{seleccionada ? seleccionada.referencia : "Registrar devolucion"}</h2><button className="modal-close" onClick={() => setModal(false)} aria-label="Cerrar modal"><X size={18} /></button></div><form className="modal-form" onSubmit={guardar}>
      <label><span>Tipo</span><select defaultValue={seleccionada?.tipo}><option>VENTA</option><option>COMPRA</option></select></label><label><span>Comprobante origen</span><input defaultValue={seleccionada?.origen} required /></label><label><span>Producto</span><select><option>Agua purificada 20 L</option><option>Bidon retornable 20 L</option></select></label><label><span>Cantidad</span><input type="number" step="0.001" defaultValue={seleccionada?.unidades} required /></label><label><span>Estado destino</span><select defaultValue={seleccionada?.destino}><option>DISPONIBLE</option><option>CUARENTENA</option><option>DANADO</option><option>DEVOLUCION</option></select></label><label><span>Total</span><input type="number" step="0.01" defaultValue={seleccionada?.total} /></label><label className="field-wide"><span>Motivo</span><textarea defaultValue={seleccionada?.motivo} required /></label>
      <div className="modal-actions"><button className="btn-secondary" type="button" onClick={() => setModal(false)}>Cerrar</button>{!seleccionada ? <button className="btn-primary">Guardar devolucion</button> : null}</div>
    </form></section></div> : null}
  </div>;
}
