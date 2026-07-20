"use client";

import { api } from "../../../lib/api";
import { ArrowLeft, ArrowRight, Check, Eye, PackagePlus, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type CatalogItem = { id: string; nombre: string; codigo?: string; costoReferencia?: number };
type Catalogs = { proveedores: CatalogItem[]; almacenes: CatalogItem[]; productos: CatalogItem[]; preparado: boolean };
type Purchase = { id: string; comprobante: string; fecha: string; proveedor: string; almacen: string; pago: string; subtotal: number; igv: number; total: number; estado: string; kardexId: string | null; items: { producto: string; cantidad: number; precio: number; subtotal: number }[] };
type Line = { productoId: string; cantidad: number; precioUnitario: number; descuento: number };

const emptyCatalogs: Catalogs = { proveedores: [], almacenes: [], productos: [], preparado: false };

export default function ComprasPage() {
  const [catalogs, setCatalogs] = useState<Catalogs>(emptyCatalogs);
  const [compras, setCompras] = useState<Purchase[]>([]);
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState("Todas");
  const [modal, setModal] = useState(false);
  const [detalle, setDetalle] = useState<Purchase | null>(null);
  const [paso, setPaso] = useState(1);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [almacenId, setAlmacenId] = useState("");
  const [tipoComprobante, setTipoComprobante] = useState("FACTURA");
  const [serie, setSerie] = useState("F001");
  const [numero, setNumero] = useState("");
  const [tipoPago, setTipoPago] = useState("CONTADO");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<Line[]>([{ productoId: "", cantidad: 1, precioUnitario: 0, descuento: 0 }]);

  async function cargar() {
    try {
      const [catalogData, purchaseData] = await Promise.all([
        api<Catalogs>("/operations/catalogs"), api<Purchase[]>("/operations/purchases"),
      ]);
      setCatalogs(catalogData);
      setCompras(purchaseData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las compras");
    }
  }

  useEffect(() => { void cargar(); }, []);

  const visibles = useMemo(() => compras.filter((item) =>
    (estado === "Todas" || item.estado === estado) &&
    `${item.comprobante} ${item.proveedor}`.toLowerCase().includes(buscar.toLowerCase()),
  ), [buscar, compras, estado]);

  const subtotal = items.reduce((sum, item) => sum + Math.max(item.cantidad * item.precioUnitario - item.descuento, 0), 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;
  const monthTotal = compras.filter((item) => item.estado === "CONFIRMADA").reduce((sum, item) => sum + item.total, 0);

  function nueva() {
    setDetalle(null); setPaso(1); setError("");
    setProveedorId(catalogs.proveedores[0]?.id ?? ""); setAlmacenId(catalogs.almacenes[0]?.id ?? "");
    setTipoComprobante("FACTURA"); setSerie("F001"); setNumero(""); setTipoPago("CONTADO"); setObservaciones("");
    setItems([{ productoId: "", cantidad: 1, precioUnitario: 0, descuento: 0 }]); setModal(true);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setItems((current) => current.map((line, position) => position === index ? { ...line, ...patch } : line));
  }

  function selectProduct(index: number, productoId: string) {
    const product = catalogs.productos.find((item) => item.id === productoId);
    updateLine(index, { productoId, precioUnitario: product?.costoReferencia ?? 0 });
  }

  function siguiente() {
    setError("");
    if (paso === 1 && (!proveedorId || !almacenId || !serie.trim() || !numero.trim())) return setError("Completa proveedor, almacen y comprobante para continuar");
    if (paso === 2 && items.some((item) => !item.productoId || item.cantidad <= 0)) return setError("Completa todos los productos y sus cantidades");
    setPaso((current) => Math.min(current + 1, 3));
  }

  async function guardar(confirmar: boolean) {
    setProcesando(true); setError("");
    try {
      await api(`/operations/purchases?confirm=${confirmar}`, {
        method: "POST",
        body: JSON.stringify({ proveedorId, almacenId, tipoComprobante, serie, numero, tipoPago, observaciones, items }),
      });
      setModal(false); await cargar();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la compra");
    } finally { setProcesando(false); }
  }

  async function confirmar(id: string) {
    setProcesando(true); setError("");
    try { await api(`/operations/purchases/${id}/confirm`, { method: "POST" }); await cargar(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo confirmar la compra"); }
    finally { setProcesando(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); if (paso < 3) siguiente(); }

  return <div className="module-page">
    <div className="module-head">
      <div className="module-title"><h1>Compras</h1><span>{compras.length} registros</span></div>
      <button className="round-add" onClick={nueva} title="Registrar compra" aria-label="Registrar compra"><Plus size={20} /></button>
    </div>
    <div className="flow-strip" aria-label="Flujo de compra"><span className="flow-active"><PackagePlus size={16} /> Registrar compra</span><ArrowRight size={15} /><span>Ingreso al almacen</span><ArrowRight size={15} /><span>Kardex automatico</span></div>
    <div className="summary-row">
      <div className="summary-glass"><span>Compras confirmadas</span><strong>S/ {monthTotal.toFixed(2)}</strong></div>
      <div className="summary-glass"><span>Por pagar</span><strong>S/ {compras.filter((item) => item.pago !== "CONTADO" && item.estado === "CONFIRMADA").reduce((sum, item) => sum + item.total, 0).toFixed(2)}</strong></div>
      <div className="summary-glass"><span>Con ingreso</span><strong>{compras.filter((item) => item.kardexId).length}</strong></div>
      <div className="summary-glass"><span>Borradores</span><strong>{compras.filter((item) => item.estado === "BORRADOR").length}</strong></div>
    </div>
    {error && !modal ? <div className="notice-error">{error}</div> : null}
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar comprobante o proveedor" /></label><select className="filter-pill" value={estado} onChange={(event) => setEstado(event.target.value)}><option>Todas</option><option>CONFIRMADA</option><option>BORRADOR</option><option>ANULADA</option></select></div>
    <div className="glass-table"><table><thead><tr><th>Comprobante</th><th>Proveedor</th><th>Destino</th><th>Pago</th><th>Total</th><th>Inventario</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visibles.map((item) => <tr key={item.id}>
      <td><strong>{item.comprobante}</strong><small>{new Date(item.fecha).toLocaleString("es-PE")}</small></td><td>{item.proveedor}</td><td>{item.almacen}</td><td>{item.pago}</td><td><strong>S/ {item.total.toFixed(2)}</strong><small>IGV S/ {item.igv.toFixed(2)}</small></td>
      <td>{item.kardexId ? <Link className="kardex-link" href="/movimientos"><Check size={13} /> Kardex #{item.kardexId}</Link> : <span className="status status-amber">Pendiente</span>}</td>
      <td><span className={item.estado === "CONFIRMADA" ? "status status-green" : "status status-amber"}>{item.estado}</span></td>
      <td><div className="row-actions"><button className="icon-soft" onClick={() => { setDetalle(item); setModal(true); }} title="Ver compra"><Eye size={16} /></button>{item.estado === "BORRADOR" ? <button className="confirm-soft" disabled={procesando} onClick={() => void confirmar(item.id)}><Check size={15} /> Confirmar</button> : null}</div></td>
    </tr>)}</tbody></table></div>

    {modal ? <div className="modal-backdrop"><section className="crud-modal operation-modal" role="dialog" aria-modal="true">
      <div className="modal-top"><div><h2>{detalle ? `Compra ${detalle.comprobante}` : "Nueva compra"}</h2><small>{detalle ? "Detalle y efecto en inventario" : `Paso ${paso} de 3`}</small></div><button className="modal-close" onClick={() => setModal(false)} aria-label="Cerrar"><X size={18} /></button></div>
      {detalle ? <div className="operation-detail"><div className="detail-summary"><span>Proveedor<strong>{detalle.proveedor}</strong></span><span>Almacen destino<strong>{detalle.almacen}</strong></span><span>Estado<strong>{detalle.estado}</strong></span></div>{detalle.items.map((item, index) => <div className="detail-line" key={index}><span>{item.producto}<small>{item.cantidad} x S/ {item.precio.toFixed(2)}</small></span><strong>S/ {item.subtotal.toFixed(2)}</strong></div>)}<div className="review-total"><span>Total</span><strong>S/ {detalle.total.toFixed(2)}</strong></div><div className="modal-actions"><button className="btn-secondary" onClick={() => setModal(false)}>Cerrar</button>{detalle.kardexId ? <Link className="btn-primary" href="/movimientos">Ver kardex</Link> : null}</div></div> :
      <form className="operation-form" onSubmit={submit}>
        <div className="stepper"><span className={paso >= 1 ? "active" : ""}>1 <small>Datos</small></span><i /><span className={paso >= 2 ? "active" : ""}>2 <small>Productos</small></span><i /><span className={paso >= 3 ? "active" : ""}>3 <small>Revisar</small></span></div>
        {paso === 1 ? <div className="step-fields">
          <label><span>Proveedor</span><select value={proveedorId} onChange={(event) => setProveedorId(event.target.value)}><option value="">Selecciona</option>{catalogs.proveedores.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
          <label><span>Almacen que recibe</span><select value={almacenId} onChange={(event) => setAlmacenId(event.target.value)}><option value="">Selecciona</option>{catalogs.almacenes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
          <label><span>Comprobante</span><select value={tipoComprobante} onChange={(event) => setTipoComprobante(event.target.value)}><option>FACTURA</option><option>BOLETA</option><option>NOTA</option></select></label>
          <label><span>Serie</span><input value={serie} onChange={(event) => setSerie(event.target.value)} placeholder="F001" /></label><label><span>Numero</span><input value={numero} onChange={(event) => setNumero(event.target.value)} placeholder="000120" /></label>
          <label><span>Tipo de pago</span><select value={tipoPago} onChange={(event) => setTipoPago(event.target.value)}><option>CONTADO</option><option>CREDITO</option><option>MIXTO</option></select></label>
        </div> : null}
        {paso === 2 ? <div className="lines-editor"><div className="lines-head"><div><strong>Productos recibidos</strong><small>Agrega una linea por producto</small></div><button type="button" className="btn-secondary" onClick={() => setItems((current) => [...current, { productoId: "", cantidad: 1, precioUnitario: 0, descuento: 0 }])}><Plus size={15} /> Producto</button></div>{items.map((item, index) => <div className="product-line" key={index}>
          <label className="line-product"><span>Producto</span><select value={item.productoId} onChange={(event) => selectProduct(index, event.target.value)}><option value="">Selecciona un producto</option>{catalogs.productos.map((product) => <option key={product.id} value={product.id}>{product.codigo} - {product.nombre}</option>)}</select></label>
          <label><span>Cantidad</span><input type="number" min="0.001" step="0.001" value={item.cantidad} onChange={(event) => updateLine(index, { cantidad: Number(event.target.value) })} /></label><label><span>Costo unitario</span><input type="number" min="0" step="0.01" value={item.precioUnitario} onChange={(event) => updateLine(index, { precioUnitario: Number(event.target.value) })} /></label>
          <strong className="line-total">S/ {(item.cantidad * item.precioUnitario).toFixed(2)}</strong><button type="button" className="line-remove" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, position) => position !== index))} title="Quitar"><Trash2 size={16} /></button>
        </div>)}</div> : null}
        {paso === 3 ? <div className="review-step"><div className="review-route"><PackagePlus size={22} /><div><small>Ingreso de inventario</small><strong>{catalogs.almacenes.find((item) => item.id === almacenId)?.nombre}</strong></div><span>{items.length} productos</span></div>{items.map((item, index) => <div className="detail-line" key={index}><span>{catalogs.productos.find((product) => product.id === item.productoId)?.nombre}<small>{item.cantidad} x S/ {item.precioUnitario.toFixed(2)}</small></span><strong>S/ {(item.cantidad * item.precioUnitario).toFixed(2)}</strong></div>)}<label className="review-notes"><span>Observaciones</span><textarea value={observaciones} onChange={(event) => setObservaciones(event.target.value)} placeholder="Nota opcional" /></label><div className="totals-box"><span>Subtotal <strong>S/ {subtotal.toFixed(2)}</strong></span><span>IGV (18%) <strong>S/ {igv.toFixed(2)}</strong></span><span className="grand-total">Total <strong>S/ {total.toFixed(2)}</strong></span></div><p className="auto-note"><Check size={15} /> Al confirmar se ingresara el stock y se creara el kardex automaticamente.</p></div> : null}
        {error ? <div className="notice-error">{error}</div> : null}
        <div className="wizard-actions"><button type="button" className="btn-secondary" onClick={() => paso === 1 ? setModal(false) : setPaso((current) => current - 1)}>{paso > 1 ? <ArrowLeft size={15} /> : null}{paso === 1 ? "Cancelar" : "Anterior"}</button>{paso < 3 ? <button className="btn-primary">Continuar <ArrowRight size={15} /></button> : <><button type="button" className="btn-secondary" disabled={procesando} onClick={() => void guardar(false)}>Guardar borrador</button><button type="button" className="btn-primary" disabled={procesando} onClick={() => void guardar(true)}><Check size={15} /> {procesando ? "Confirmando..." : "Confirmar compra"}</button></>}</div>
      </form>}
    </section></div> : null}
  </div>;
}
