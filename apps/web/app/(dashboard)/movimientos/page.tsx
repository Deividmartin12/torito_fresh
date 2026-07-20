"use client";

import { api } from "../../../lib/api";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Eye, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Movement = { id: string; referencia: string; fecha: string; tipo: string; operacion: string; origen: string; destino: string; estado: string; unidades: number; detalles: { producto: string; direccion: string; cantidad: number; saldoAnterior: number; saldoPosterior: number }[] };

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<Movement[]>([]);
  const [buscar, setBuscar] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [seleccionado, setSeleccionado] = useState<Movement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { api<Movement[]>("/operations/movements").then(setMovimientos).catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo cargar el kardex")); }, []);
  const visibles = useMemo(() => movimientos.filter((item) =>
    (tipo === "Todos" || item.tipo === tipo) && `${item.referencia} ${item.operacion} ${item.origen} ${item.destino}`.toLowerCase().includes(buscar.toLowerCase()),
  ), [buscar, movimientos, tipo]);

  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Kardex</h1><span>{movimientos.length} movimientos</span></div></div>
    <div className="flow-strip"><span>Compras y ventas confirmadas</span><ArrowRight size={15} /><span className="flow-active">Movimiento automatico</span><ArrowRight size={15} /><span>Saldo trazable</span></div>
    {error ? <div className="notice-error">{error}</div> : null}
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar referencia, operacion o almacen" /></label><select className="filter-pill" value={tipo} onChange={(event) => setTipo(event.target.value)}><option>Todos</option><option>ENTRADA</option><option>SALIDA</option><option>TRANSFERENCIA</option></select></div>
    <div className="glass-table"><table><thead><tr><th>Referencia</th><th>Tipo</th><th>Operacion</th><th>Ruta de inventario</th><th>Lineas</th><th>Unidades</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>{visibles.map((item) => { const Icon = item.tipo === "ENTRADA" ? ArrowDownLeft : item.tipo === "SALIDA" ? ArrowUpRight : ArrowRight; return <tr key={item.id}><td><strong>{item.referencia}</strong><small>{new Date(item.fecha).toLocaleString("es-PE")}</small></td><td><span className="status status-blue"><Icon size={13} /> {item.tipo}</span></td><td>{item.operacion}</td><td><strong>{item.origen}</strong><small>hacia {item.destino}</small></td><td>{item.detalles.length}</td><td>{item.unidades}</td><td><span className="status status-green">{item.estado}</span></td><td><button className="icon-soft" onClick={() => setSeleccionado(item)} title="Ver saldos"><Eye size={16} /></button></td></tr>; })}</tbody></table></div>
    {seleccionado ? <div className="modal-backdrop"><section className="crud-modal" role="dialog" aria-modal="true"><div className="modal-top"><div><h2>{seleccionado.referencia}</h2><small>{seleccionado.operacion} · {new Date(seleccionado.fecha).toLocaleString("es-PE")}</small></div><button className="modal-close" onClick={() => setSeleccionado(null)} aria-label="Cerrar"><X size={18} /></button></div><div className="operation-detail"><div className="detail-summary"><span>Origen<strong>{seleccionado.origen}</strong></span><span>Destino<strong>{seleccionado.destino}</strong></span><span>Estado<strong>{seleccionado.estado}</strong></span></div>{seleccionado.detalles.map((item, index) => <div className="kardex-detail-line" key={index}><span>{item.producto}<small>{item.direccion} · {item.cantidad} unidades</small></span><div><small>Saldo anterior</small><strong>{item.saldoAnterior}</strong></div><ArrowRight size={16} /><div><small>Saldo posterior</small><strong>{item.saldoPosterior}</strong></div></div>)}<div className="modal-actions"><button className="btn-secondary" onClick={() => setSeleccionado(null)}>Cerrar</button></div></div></section></div> : null}
  </div>;
}
