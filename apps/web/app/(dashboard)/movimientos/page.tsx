"use client";

import { api } from "../../../lib/api";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Boxes, Eye, FileText, Search, UserRound, Warehouse, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type MovementDetail = {
  producto: string;
  codigo: string | null;
  almacen: string;
  lote: string;
  estadoInventario: string;
  direccion: string;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  saldoAnterior: number;
  saldoPosterior: number;
};

type Movement = {
  id: string;
  referencia: string;
  fecha: string;
  tipo: string;
  operacion: string;
  comprobante: string;
  tercero: string;
  explicacion: string;
  observaciones: string | null;
  responsable: string;
  origen: string;
  destino: string;
  estado: string;
  unidades: number;
  detalles: MovementDetail[];
};

const quantity = (value: number) => new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format(value);
const money = (value: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value);

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<Movement[]>([]);
  const [buscar, setBuscar] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [seleccionado, setSeleccionado] = useState<Movement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { api<Movement[]>("/operations/movements").then(setMovimientos).catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo cargar el kardex")); }, []);
  const visibles = useMemo(() => movimientos.filter((item) =>
    (tipo === "Todos" || item.tipo === tipo) && `${item.referencia} ${item.operacion} ${item.comprobante} ${item.tercero} ${item.origen} ${item.destino}`.toLowerCase().includes(buscar.toLowerCase()),
  ), [buscar, movimientos, tipo]);

  return <div className="module-page kardex-page">
    <div className="module-head"><div className="module-title"><h1>Kardex de inventario</h1><span>{movimientos.length} movimientos trazables</span></div></div>
    {error ? <div className="notice-error">{error}</div> : null}
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar comprobante, tercero, referencia o almacén" /></label><select className="filter-pill" value={tipo} onChange={(event) => setTipo(event.target.value)}><option>Todos</option><option>ENTRADA</option><option>SALIDA</option><option>TRANSFERENCIA</option></select></div>
    <div className="glass-table"><table><thead><tr><th>Movimiento</th><th>Qué ocurrió</th><th>Comprobante y tercero</th><th>Ruta del inventario</th><th>Productos</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>{visibles.length ? visibles.map((item) => { const Icon = item.tipo === "ENTRADA" ? ArrowDownLeft : item.tipo === "SALIDA" ? ArrowUpRight : ArrowRight; return <tr key={item.id}><td><strong>{item.referencia}</strong><small>{new Date(item.fecha).toLocaleString("es-PE")}</small></td><td><span className={`status ${item.tipo === "ENTRADA" ? "status-green" : "status-blue"}`}><Icon size={13} /> {item.tipo}</span><small>{item.explicacion}</small></td><td><strong>{item.comprobante}</strong><small>{item.tercero}</small></td><td><strong>{item.origen}</strong><small>Hacia: {item.destino}</small></td><td><strong>{item.detalles.length} {item.detalles.length === 1 ? "producto" : "productos"}</strong><small>{quantity(item.unidades)} unidades en total</small></td><td><span className="status status-green">{item.estado}</span></td><td><button className="icon-soft" onClick={() => setSeleccionado(item)} title="Ver cómo cambió el stock" aria-label={`Ver detalle del movimiento ${item.referencia}`}><Eye size={16} /></button></td></tr>; }) : <tr><td colSpan={7}><div className="table-empty"><Search size={22} /><span>No hay movimientos que coincidan con la búsqueda.</span></div></td></tr>}</tbody></table></div>

    {seleccionado ? <div className="modal-backdrop"><section className="crud-modal kardex-modal" role="dialog" aria-modal="true" aria-labelledby="kardex-detail-title"><div className="modal-top"><div><h2 id="kardex-detail-title">{seleccionado.referencia}</h2><small>{seleccionado.operacion} · {seleccionado.comprobante} · {new Date(seleccionado.fecha).toLocaleString("es-PE")}</small></div><button className="modal-close" onClick={() => setSeleccionado(null)} aria-label="Cerrar"><X size={18} /></button></div><div className="operation-detail kardex-detail">
      <p className="kardex-explanation">{seleccionado.explicacion}</p>
      <div className="kardex-summary-grid"><div><FileText size={17} /><span>Documento<strong>{seleccionado.comprobante}</strong><small>{seleccionado.tercero}</small></span></div><div><Boxes size={17} /><span>Movimiento<strong>{seleccionado.tipo}</strong><small>{quantity(seleccionado.unidades)} unidades</small></span></div><div><UserRound size={17} /><span>Responsable<strong>{seleccionado.responsable}</strong><small>{seleccionado.estado}</small></span></div></div>
      <div className="kardex-route"><div><small>Sale de</small><strong>{seleccionado.origen}</strong></div><ArrowRight size={20} /><div><small>Llega a</small><strong>{seleccionado.destino}</strong></div></div>
      {seleccionado.observaciones ? <div className="kardex-observation"><FileText size={17} /><div><strong>Motivo registrado</strong><p>{seleccionado.observaciones}</p></div></div> : null}
      <div className="kardex-products-heading"><Warehouse size={18} /><div><strong>Cambio de stock por producto</strong><small>El cálculo muestra el saldo antes y después de cada movimiento.</small></div></div>
      <div className="kardex-product-list">{seleccionado.detalles.map((item, index) => {
        const entry = item.direccion === "ENTRADA";
        return <article className="kardex-product-card" key={`${item.producto}-${index}`}><div className="kardex-product-head"><div><strong>{item.producto}</strong><small>{item.codigo || "Sin código"} · {item.almacen} · {item.lote}</small></div><span className={`status ${entry ? "status-green" : "status-blue"}`}>{entry ? "+" : "−"}{quantity(item.cantidad)} unidades</span></div><div className="kardex-balance-equation"><div><small>Saldo anterior</small><strong>{quantity(item.saldoAnterior)}</strong></div><span className={entry ? "entry" : "exit"}>{entry ? "+" : "−"} {quantity(item.cantidad)}</span><div><small>Saldo posterior</small><strong>{quantity(item.saldoPosterior)}</strong></div></div><div className="kardex-product-meta"><span>Estado: <strong>{item.estadoInventario}</strong></span><span>Costo unitario: <strong>{money(item.costoUnitario)}</strong></span><span>Valor movido: <strong>{money(item.costoTotal)}</strong></span></div></article>;
      })}</div>
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setSeleccionado(null)}>Cerrar</button></div>
    </div></section></div> : null}
  </div>;
}
