"use client";

import { Eye, Plus, Search, WalletCards, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type Cuenta = { id: number; tercero: string; documento: string; comprobante: string; emision: string; vencimiento: string; original: number; pagado: number; saldo: number; estado: string };

const cuentasCobrar: Cuenta[] = [
  { id: 1, tercero: "Restaurante El Buen Sabor", documento: "20600123456", comprobante: "F001-000089", emision: "12/07/2026", vencimiento: "27/07/2026", original: 240, pagado: 60, saldo: 180, estado: "PARCIAL" },
  { id: 2, tercero: "Minimarket La Esquina", documento: "10456789123", comprobante: "F001-000078", emision: "28/06/2026", vencimiento: "12/07/2026", original: 360, pagado: 0, saldo: 360, estado: "VENCIDA" },
];

const cuentasPagar: Cuenta[] = [
  { id: 1, tercero: "Aguas del Norte S.A.C.", documento: "20601234567", comprobante: "F001-00120", emision: "11/07/2026", vencimiento: "26/07/2026", original: 1450, pagado: 500, saldo: 950, estado: "PARCIAL" },
  { id: 2, tercero: "Envases Peruanos E.I.R.L.", documento: "20509876543", comprobante: "F004-00810", emision: "28/06/2026", vencimiento: "12/07/2026", original: 720, pagado: 0, saldo: 720, estado: "VENCIDA" },
];

export function AccountsTablePage({ tipo }: { tipo: "cobrar" | "pagar" }) {
  const cuentas = tipo === "cobrar" ? cuentasCobrar : cuentasPagar;
  const tercero = tipo === "cobrar" ? "Cliente" : "Proveedor";
  const [buscar, setBuscar] = useState(""); const [estado, setEstado] = useState("Todas"); const [modal, setModal] = useState(false); const [seleccionada, setSeleccionada] = useState<Cuenta | null>(null);
  const visibles = useMemo(() => cuentas.filter((item) => (estado === "Todas" || item.estado === estado) && `${item.tercero} ${item.documento} ${item.comprobante}`.toLowerCase().includes(buscar.toLowerCase())), [buscar, cuentas, estado]);
  function abrir(item?: Cuenta) { setSeleccionada(item ?? null); setModal(true); } function guardar(event: FormEvent) { event.preventDefault(); setModal(false); }
  const saldoTotal = cuentas.reduce((total, item) => total + item.saldo, 0);
  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Cuentas por {tipo}</h1><span>{cuentas.length} cuentas</span></div><button className="round-add" onClick={() => abrir()} title={`Registrar pago por ${tipo}`} aria-label={`Registrar pago por ${tipo}`}><Plus size={20} /></button></div>
    <div className="summary-row"><div className="summary-glass"><span>Saldo total</span><strong>S/ {saldoTotal.toFixed(2)}</strong></div><div className="summary-glass"><span>Pendientes</span><strong>{cuentas.length}</strong></div><div className="summary-glass"><span>Vencidas</span><strong>{cuentas.filter((item) => item.estado === "VENCIDA").length}</strong></div><div className="summary-glass"><span>Pagado este mes</span><strong>S/ {cuentas.reduce((total, item) => total + item.pagado, 0).toFixed(2)}</strong></div></div>
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder={`Buscar ${tercero.toLowerCase()} o comprobante`} /></label><select className="filter-pill" value={estado} onChange={(event) => setEstado(event.target.value)}><option>Todas</option><option>PENDIENTE</option><option>PARCIAL</option><option>VENCIDA</option><option>PAGADA</option></select></div>
    <div className="glass-table"><table><thead><tr><th>{tercero}</th><th>Comprobante</th><th>Emision</th><th>Vencimiento</th><th>Monto original</th><th>Pagado</th><th>Saldo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visibles.map((item) => <tr key={item.id}><td><strong>{item.tercero}</strong><small>{item.documento}</small></td><td>{item.comprobante}</td><td>{item.emision}</td><td>{item.vencimiento}</td><td>S/ {item.original.toFixed(2)}</td><td>S/ {item.pagado.toFixed(2)}</td><td><strong>S/ {item.saldo.toFixed(2)}</strong></td><td><span className={item.estado === "VENCIDA" ? "status status-red" : "status status-amber"}>{item.estado}</span></td><td><div className="row-actions"><button className="icon-soft" onClick={() => abrir(item)} title="Registrar pago"><WalletCards size={16} /></button><button className="icon-soft" title="Ver historial"><Eye size={16} /></button></div></td></tr>)}</tbody></table></div>
    {modal ? <div className="modal-backdrop"><section className="crud-modal" role="dialog" aria-modal="true" aria-label={`Registrar pago por ${tipo}`}><div className="modal-top"><h2>Registrar pago por {tipo}</h2><button className="modal-close" onClick={() => setModal(false)} aria-label="Cerrar modal"><X size={18} /></button></div><form className="modal-form" onSubmit={guardar}>
      <label className="field-wide"><span>Cuenta</span><select defaultValue={seleccionada?.id}>{cuentas.map((item) => <option key={item.id} value={item.id}>{item.tercero} · {item.comprobante} · S/ {item.saldo.toFixed(2)}</option>)}</select></label><label><span>Metodo de pago</span><select><option>EFECTIVO</option><option>YAPE</option><option>PLIN</option><option>TRANSFERENCIA</option></select></label><label><span>Monto</span><input type="number" step="0.01" max={seleccionada?.saldo} defaultValue={seleccionada?.saldo} required /></label><label><span>Numero de operacion</span><input placeholder="Opcional" /></label><label><span>Fecha</span><input type="date" required /></label><label className="field-wide"><span>Observaciones</span><textarea /></label>
      <div className="modal-actions"><button className="btn-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary">Registrar pago</button></div>
    </form></section></div> : null}
  </div>;
}
