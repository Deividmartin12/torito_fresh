"use client";

import { api } from "../../../lib/api";
import { ArrowLeft, ArrowRight, Check, Eye, PackageCheck, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type CatalogItem = { id: string; nombre: string; codigo?: string; precioVenta?: number };
type Catalogs = { clientes: CatalogItem[]; almacenes: CatalogItem[]; productos: CatalogItem[]; preparado: boolean };
type Stock = { producto: string; codigo: string; almacen: string; estado: string; cantidad: number; reservada: number };
type Sale = { id: string; comprobante: string; fecha: string; cliente: string; almacen: string; pago: string; subtotal: number; igv: number; total: number; saldo: number; estado: string; kardexId: string | null; items: { producto: string; cantidad: number; precio: number; subtotal: number }[] };
type Line = { productoId: string; cantidad: number; precioUnitario: number; descuento: number };

const emptyCatalogs: Catalogs = { clientes: [], almacenes: [], productos: [], preparado: false };

export default function VentasPage() {
  const [catalogs, setCatalogs] = useState<Catalogs>(emptyCatalogs);
  const [stock, setStock] = useState<Stock[]>([]);
  const [ventas, setVentas] = useState<Sale[]>([]);
  const [buscar, setBuscar] = useState("");
  const [pago, setPago] = useState("Todos");
  const [modal, setModal] = useState(false);
  const [detalle, setDetalle] = useState<Sale | null>(null);
  const [paso, setPaso] = useState(1);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [almacenId, setAlmacenId] = useState("");
  const [tipoComprobante, setTipoComprobante] = useState("BOLETA");
  const [serie, setSerie] = useState("B001");
  const [numero, setNumero] = useState("");
  const [tipoPago, setTipoPago] = useState("CONTADO");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<Line[]>([{ productoId: "", cantidad: 1, precioUnitario: 0, descuento: 0 }]);

  async function cargar() {
    try {
      const [catalogData, saleData, stockData] = await Promise.all([
        api<Catalogs>("/operations/catalogs"), api<Sale[]>("/operations/sales"), api<Stock[]>("/operations/stock"),
      ]);
      setCatalogs(catalogData); setVentas(saleData); setStock(stockData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron cargar las ventas"); }
  }

  useEffect(() => { void cargar(); }, []);

  const visibles = useMemo(() => ventas.filter((item) =>
    (pago === "Todos" || item.pago === pago) && `${item.comprobante} ${item.cliente}`.toLowerCase().includes(buscar.toLowerCase()),
  ), [buscar, pago, ventas]);
  const subtotal = items.reduce((sum, item) => sum + Math.max(item.cantidad * item.precioUnitario - item.descuento, 0), 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  function nueva() {
    setDetalle(null); setPaso(1); setError(""); setClienteId(catalogs.clientes[0]?.id ?? ""); setAlmacenId(catalogs.almacenes[0]?.id ?? "");
    setTipoComprobante("BOLETA"); setSerie("B001"); setNumero(""); setTipoPago("CONTADO"); setObservaciones("");
    setItems([{ productoId: "", cantidad: 1, precioUnitario: 0, descuento: 0 }]); setModal(true);
  }

  function updateLine(index: number, patch: Partial<Line>) { setItems((current) => current.map((line, position) => position === index ? { ...line, ...patch } : line)); }
  function selectProduct(index: number, productoId: string) {
    const product = catalogs.productos.find((item) => item.id === productoId);
    updateLine(index, { productoId, precioUnitario: product?.precioVenta ?? 0 });
  }
  function available(productoId: string) {
    const product = catalogs.productos.find((item) => item.id === productoId);
    const warehouse = catalogs.almacenes.find((item) => item.id === almacenId);
    return stock.filter((item) => item.codigo === product?.codigo && item.almacen === warehouse?.nombre && item.estado === "DISPONIBLE").reduce((sum, item) => sum + item.cantidad - item.reservada, 0);
  }

  function siguiente() {
    setError("");
    if (paso === 1 && (!clienteId || !almacenId || !serie.trim() || !numero.trim())) return setError("Completa cliente, almacen y comprobante para continuar");
    if (paso === 2 && items.some((item) => !item.productoId || item.cantidad <= 0)) return setError("Completa todos los productos y sus cantidades");
    if (paso === 2) {
      const insufficient = items.find((item) => item.cantidad > available(item.productoId));
      if (insufficient) return setError("Una cantidad supera el stock disponible del almacen seleccionado");
    }
    setPaso((current) => Math.min(current + 1, 3));
  }

  async function guardar(confirmar: boolean) {
    setProcesando(true); setError("");
    try {
      await api(`/operations/sales?confirm=${confirmar}`, { method: "POST", body: JSON.stringify({ clienteId, almacenId, tipoComprobante, serie, numero, tipoPago, observaciones, items }) });
      setModal(false); await cargar();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la venta"); }
    finally { setProcesando(false); }
  }

  async function confirmar(id: string) {
    setProcesando(true); setError("");
    try { await api(`/operations/sales/${id}/confirm`, { method: "POST" }); await cargar(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo confirmar la venta"); }
    finally { setProcesando(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); if (paso < 3) siguiente(); }
  const confirmed = ventas.filter((item) => item.estado === "CONFIRMADA");

  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Ventas</h1><span>{ventas.length} registros</span></div><button className="round-add" onClick={nueva} title="Registrar venta" aria-label="Registrar venta"><Plus size={20} /></button></div>
    <div className="flow-strip" aria-label="Flujo de venta"><span className="flow-active"><ShoppingCart size={16} /> Registrar venta</span><ArrowRight size={15} /><span>Validar stock</span><ArrowRight size={15} /><span>Salida y kardex</span></div>
    <div className="summary-row"><div className="summary-glass"><span>Ventas confirmadas</span><strong>S/ {confirmed.reduce((sum, item) => sum + item.total, 0).toFixed(2)}</strong></div><div className="summary-glass"><span>Cobrado</span><strong>S/ {confirmed.reduce((sum, item) => sum + item.total - item.saldo, 0).toFixed(2)}</strong></div><div className="summary-glass"><span>Por cobrar</span><strong>S/ {confirmed.reduce((sum, item) => sum + item.saldo, 0).toFixed(2)}</strong></div><div className="summary-glass"><span>Con kardex</span><strong>{confirmed.filter((item) => item.kardexId).length}</strong></div></div>
    {error && !modal ? <div className="notice-error">{error}</div> : null}
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar comprobante o cliente" /></label><select className="filter-pill" value={pago} onChange={(event) => setPago(event.target.value)}><option>Todos</option><option>CONTADO</option><option>CREDITO</option><option>MIXTO</option></select></div>
    <div className="glass-table"><table><thead><tr><th>Comprobante</th><th>Cliente</th><th>Origen</th><th>Pago</th><th>Total</th><th>Inventario</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visibles.map((item) => <tr key={item.id}>
      <td><strong>{item.comprobante}</strong><small>{new Date(item.fecha).toLocaleString("es-PE")}</small></td><td>{item.cliente}</td><td>{item.almacen}</td><td>{item.pago}</td><td><strong>S/ {item.total.toFixed(2)}</strong><small>{item.saldo ? `Saldo S/ ${item.saldo.toFixed(2)}` : "Sin saldo"}</small></td>
      <td>{item.kardexId ? <Link className="kardex-link" href="/movimientos"><Check size={13} /> Kardex #{item.kardexId}</Link> : <span className="status status-amber">Pendiente</span>}</td><td><span className={item.estado === "CONFIRMADA" ? "status status-green" : "status status-amber"}>{item.estado}</span></td>
      <td><div className="row-actions"><button className="icon-soft" onClick={() => { setDetalle(item); setModal(true); }} title="Ver venta"><Eye size={16} /></button>{item.estado === "BORRADOR" ? <button className="confirm-soft" disabled={procesando} onClick={() => void confirmar(item.id)}><Check size={15} /> Confirmar</button> : null}</div></td>
    </tr>)}</tbody></table></div>

    {modal ? <div className="modal-backdrop"><section className="crud-modal operation-modal" role="dialog" aria-modal="true">
      <div className="modal-top"><div><h2>{detalle ? `Venta ${detalle.comprobante}` : "Nueva venta"}</h2><small>{detalle ? "Detalle y efecto en inventario" : `Paso ${paso} de 3`}</small></div><button className="modal-close" onClick={() => setModal(false)} aria-label="Cerrar"><X size={18} /></button></div>
      {detalle ? <div className="operation-detail"><div className="detail-summary"><span>Cliente<strong>{detalle.cliente}</strong></span><span>Almacen origen<strong>{detalle.almacen}</strong></span><span>Estado<strong>{detalle.estado}</strong></span></div>{detalle.items.map((item, index) => <div className="detail-line" key={index}><span>{item.producto}<small>{item.cantidad} x S/ {item.precio.toFixed(2)}</small></span><strong>S/ {item.subtotal.toFixed(2)}</strong></div>)}<div className="review-total"><span>Total</span><strong>S/ {detalle.total.toFixed(2)}</strong></div><div className="modal-actions"><button className="btn-secondary" onClick={() => setModal(false)}>Cerrar</button>{detalle.kardexId ? <Link className="btn-primary" href="/movimientos">Ver kardex</Link> : null}</div></div> :
      <form className="operation-form" onSubmit={submit}>
        <div className="stepper"><span className={paso >= 1 ? "active" : ""}>1 <small>Datos</small></span><i /><span className={paso >= 2 ? "active" : ""}>2 <small>Productos</small></span><i /><span className={paso >= 3 ? "active" : ""}>3 <small>Revisar</small></span></div>
        {paso === 1 ? <div className="step-fields"><label><span>Cliente</span><select value={clienteId} onChange={(event) => setClienteId(event.target.value)}><option value="">Selecciona</option>{catalogs.clientes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><label><span>Almacen de salida</span><select value={almacenId} onChange={(event) => setAlmacenId(event.target.value)}><option value="">Selecciona</option>{catalogs.almacenes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><label><span>Comprobante</span><select value={tipoComprobante} onChange={(event) => setTipoComprobante(event.target.value)}><option>BOLETA</option><option>FACTURA</option><option>NOTA</option></select></label><label><span>Serie</span><input value={serie} onChange={(event) => setSerie(event.target.value)} placeholder="B001" /></label><label><span>Numero</span><input value={numero} onChange={(event) => setNumero(event.target.value)} placeholder="000352" /></label><label><span>Tipo de pago</span><select value={tipoPago} onChange={(event) => setTipoPago(event.target.value)}><option>CONTADO</option><option>CREDITO</option><option>MIXTO</option></select></label></div> : null}
        {paso === 2 ? <div className="lines-editor"><div className="lines-head"><div><strong>Productos vendidos</strong><small>El stock se valida en el almacen elegido</small></div><button type="button" className="btn-secondary" onClick={() => setItems((current) => [...current, { productoId: "", cantidad: 1, precioUnitario: 0, descuento: 0 }])}><Plus size={15} /> Producto</button></div>{items.map((item, index) => <div className="product-line" key={index}><label className="line-product"><span>Producto</span><select value={item.productoId} onChange={(event) => selectProduct(index, event.target.value)}><option value="">Selecciona un producto</option>{catalogs.productos.map((product) => <option key={product.id} value={product.id}>{product.codigo} - {product.nombre}</option>)}</select><small className={item.productoId && available(item.productoId) < item.cantidad ? "stock-warning" : "stock-hint"}>Disponible: {available(item.productoId)}</small></label><label><span>Cantidad</span><input type="number" min="0.001" step="0.001" value={item.cantidad} onChange={(event) => updateLine(index, { cantidad: Number(event.target.value) })} /></label><label><span>Precio unitario</span><input type="number" min="0" step="0.01" value={item.precioUnitario} onChange={(event) => updateLine(index, { precioUnitario: Number(event.target.value) })} /></label><strong className="line-total">S/ {(item.cantidad * item.precioUnitario).toFixed(2)}</strong><button type="button" className="line-remove" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, position) => position !== index))} title="Quitar"><Trash2 size={16} /></button></div>)}</div> : null}
        {paso === 3 ? <div className="review-step"><div className="review-route"><PackageCheck size={22} /><div><small>Salida de inventario</small><strong>{catalogs.almacenes.find((item) => item.id === almacenId)?.nombre}</strong></div><span>{items.length} productos</span></div>{items.map((item, index) => <div className="detail-line" key={index}><span>{catalogs.productos.find((product) => product.id === item.productoId)?.nombre}<small>{item.cantidad} x S/ {item.precioUnitario.toFixed(2)} · quedan {available(item.productoId) - item.cantidad}</small></span><strong>S/ {(item.cantidad * item.precioUnitario).toFixed(2)}</strong></div>)}<label className="review-notes"><span>Observaciones</span><textarea value={observaciones} onChange={(event) => setObservaciones(event.target.value)} placeholder="Nota opcional" /></label><div className="totals-box"><span>Subtotal <strong>S/ {subtotal.toFixed(2)}</strong></span><span>IGV (18%) <strong>S/ {igv.toFixed(2)}</strong></span><span className="grand-total">Total <strong>S/ {total.toFixed(2)}</strong></span></div><p className="auto-note"><Check size={15} /> Al confirmar se descontara el stock y se creara el kardex automaticamente.</p></div> : null}
        {error ? <div className="notice-error">{error}</div> : null}
        <div className="wizard-actions"><button type="button" className="btn-secondary" onClick={() => paso === 1 ? setModal(false) : setPaso((current) => current - 1)}>{paso > 1 ? <ArrowLeft size={15} /> : null}{paso === 1 ? "Cancelar" : "Anterior"}</button>{paso < 3 ? <button className="btn-primary">Continuar <ArrowRight size={15} /></button> : <><button type="button" className="btn-secondary" disabled={procesando} onClick={() => void guardar(false)}>Guardar borrador</button><button type="button" className="btn-primary" disabled={procesando} onClick={() => void guardar(true)}><Check size={15} /> {procesando ? "Confirmando..." : "Confirmar venta"}</button></>}</div>
      </form>}
    </section></div> : null}
  </div>;
}
