"use client";

import { api } from "../../../lib/api";
import { ArrowDownLeft, ArrowUpRight, History, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Stock = { id: string; producto: string; codigo: string; almacen: string; lote: string; estado: string; cantidad: number; reservada: number; minimo: number; costo: number };

export default function InventarioPage() {
  const [stock, setStock] = useState<Stock[]>([]);
  const [buscar, setBuscar] = useState("");
  const [almacen, setAlmacen] = useState("Todos");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Stock[]>("/operations/stock").then(setStock).catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo cargar el stock"));
  }, []);

  const almacenes = [...new Set(stock.map((item) => item.almacen))];
  const visibles = useMemo(() => stock.filter((item) =>
    (almacen === "Todos" || item.almacen === almacen) && `${item.producto} ${item.codigo} ${item.lote}`.toLowerCase().includes(buscar.toLowerCase()),
  ), [almacen, buscar, stock]);
  const disponibles = stock.filter((item) => item.estado === "DISPONIBLE").reduce((sum, item) => sum + item.cantidad - item.reservada, 0);

  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Stock por almacen</h1><span>{stock.length} posiciones</span></div><Link className="round-add" href="/movimientos" title="Ver kardex" aria-label="Ver kardex"><History size={20} /></Link></div>
    <div className="inventory-flow"><div><ArrowDownLeft size={18} /><span>Compra confirmada<strong>suma stock</strong></span></div><i /><div><History size={18} /><span>Kardex<strong>registra el saldo</strong></span></div><i /><div><ArrowUpRight size={18} /><span>Venta confirmada<strong>descuenta stock</strong></span></div></div>
    <div className="summary-row"><div className="summary-glass"><span>Disponible real</span><strong>{disponibles}</strong></div><div className="summary-glass"><span>Reservado</span><strong>{stock.reduce((sum, item) => sum + item.reservada, 0)}</strong></div><div className="summary-glass"><span>Otros estados</span><strong>{stock.filter((item) => item.estado !== "DISPONIBLE").reduce((sum, item) => sum + item.cantidad, 0)}</strong></div><div className="summary-glass"><span>Bajo minimo</span><strong>{stock.filter((item) => item.cantidad - item.reservada < item.minimo).length}</strong></div></div>
    {error ? <div className="notice-error">{error}</div> : null}
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar producto, codigo o lote" /></label><select className="filter-pill" value={almacen} onChange={(event) => setAlmacen(event.target.value)}><option>Todos</option>{almacenes.map((item) => <option key={item}>{item}</option>)}</select></div>
    <div className="glass-table"><table><thead><tr><th>Producto</th><th>Almacen</th><th>Lote</th><th>Estado</th><th>Cantidad</th><th>Reservada</th><th>Disponible real</th><th>Minimo</th><th>Costo promedio</th></tr></thead><tbody>{visibles.map((item) => <tr key={item.id}><td><strong>{item.producto}</strong><small>{item.codigo}</small></td><td>{item.almacen}</td><td>{item.lote}</td><td><span className={item.estado === "DISPONIBLE" ? "status status-green" : "status status-red"}>{item.estado}</span></td><td>{item.cantidad}</td><td>{item.reservada}</td><td><strong>{item.cantidad - item.reservada}</strong></td><td>{item.minimo}</td><td>S/ {item.costo.toFixed(4)}</td></tr>)}</tbody></table></div>
  </div>;
}
