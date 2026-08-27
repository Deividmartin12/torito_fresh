'use client';

import { api } from '../../../lib/api';
import { ArrowRight, Boxes, Factory, History, Recycle, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Stock = {
  id: string;
  producto: string;
  codigo: string;
  categoria: string;
  almacen: string;
  almacenTipo: string;
  lote: string;
  estado: string;
  cantidad: number;
  reservada: number;
  minimo: number;
  costo: number;
};

export default function InventarioPage() {
  const [stock, setStock] = useState<Stock[]>([]);
  const [buscar, setBuscar] = useState('');
  const [almacen, setAlmacen] = useState('Todos');
  const [error, setError] = useState('');

  useEffect(() => {
    api<Stock[]>('/operations/stock')
      .then(setStock)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar el stock'),
      );
  }, []);

  const almacenes = [...new Set(stock.map((item) => item.almacen))];
  const visibles = useMemo(
    () =>
      stock.filter(
        (item) =>
          (almacen === 'Todos' || item.almacen === almacen) &&
          `${item.producto} ${item.codigo} ${item.lote}`
            .toLowerCase()
            .includes(buscar.toLowerCase()),
      ),
    [almacen, buscar, stock],
  );
  const byWarehouseType = (type: string) =>
    stock
      .filter((item) => item.almacenTipo === type)
      .reduce((sum, item) => sum + item.cantidad - item.reservada, 0);
  const emptyContainers = stock
    .filter((item) => item.estado === 'VACIO')
    .reduce((sum, item) => sum + item.cantidad - item.reservada, 0);

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Inventarios por etapa</h1>
          <span>{stock.length} posiciones trazables</span>
        </div>
        <Link className="round-add" href="/movimientos" title="Ver kardex" aria-label="Ver kardex">
          <History size={20} />
        </Link>
      </div>
      <div className="inventory-flow">
        <div>
          <Boxes size={18} />
          <span>
            Materia prima<strong>compras e insumos</strong>
          </span>
        </div>
        <i />
        <div>
          <Factory size={18} />
          <span>
            Producción<strong>transforma inventario</strong>
          </span>
        </div>
        <i />
        <div>
          <Recycle size={18} />
          <span>
            Envases<strong>retorno y reutilización</strong>
          </span>
        </div>
        <i />
        <div>
          <ArrowRight size={18} />
          <span>
            Producto terminado<strong>disponible para venta</strong>
          </span>
        </div>
      </div>
      <div className="summary-row">
        <div className="summary-glass">
          <span>Materia prima</span>
          <strong>{byWarehouseType('MATERIA_PRIMA')}</strong>
        </div>
        <div className="summary-glass">
          <span>Producto terminado</span>
          <strong>{byWarehouseType('PRODUCTO_TERMINADO')}</strong>
        </div>
        <div className="summary-glass">
          <span>Envases vacíos limpios</span>
          <strong>{emptyContainers}</strong>
        </div>
        <div className="summary-glass">
          <span>Dañados / cuarentena</span>
          <strong>
            {stock
              .filter((item) => ['DANADO', 'CUARENTENA'].includes(item.estado))
              .reduce((sum, item) => sum + item.cantidad, 0)}
          </strong>
        </div>
      </div>
      {error ? <div className="notice-error">{error}</div> : null}
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar producto, codigo o lote"
          />
        </label>
        <select
          className="filter-pill"
          value={almacen}
          onChange={(event) => setAlmacen(event.target.value)}
        >
          <option>Todos</option>
          {almacenes.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <div className="glass-table">
        <table>
          <thead>
            <tr>
              <th>Producto / insumo</th>
              <th>Etapa</th>
              <th>Almacén</th>
              <th>Lote</th>
              <th>Estado</th>
              <th>Cantidad</th>
              <th>Reservada</th>
              <th>Disponible real</th>
              <th>Costo promedio</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.producto}</strong>
                  <small>
                    {item.codigo} · {item.categoria}
                  </small>
                </td>
                <td>{item.almacenTipo.replaceAll('_', ' ')}</td>
                <td>{item.almacen}</td>
                <td>{item.lote}</td>
                <td>
                  <span
                    className={
                      ['DISPONIBLE', 'LLENO', 'VACIO'].includes(item.estado)
                        ? 'status status-green'
                        : 'status status-red'
                    }
                  >
                    {item.estado}
                  </span>
                </td>
                <td>{item.cantidad}</td>
                <td>{item.reservada}</td>
                <td>
                  <strong>{item.cantidad - item.reservada}</strong>
                </td>
                <td>S/ {item.costo.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
