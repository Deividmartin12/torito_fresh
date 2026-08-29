'use client';

import {
  ArrowRight,
  Boxes,
  Eye,
  FileText,
  Search,
  UserRound,
  Warehouse,
  X,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Pagination } from '../../../components/Pagination';
import { PeriodFilter } from '../../../components/PeriodFilter';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { ProductLedger } from '../../../components/kardex/ProductLedger';
import { dateTime, money, quantity } from '../../../lib/format';
import { MOVEMENT_TYPE_OPTIONS, directionLabel, movementStyle } from '../../../lib/kardex';
import {
  CatalogItem,
  Movement,
  getMovements,
  getOperationCatalogs,
} from '../../../lib/operations';

type Tab = 'movimientos' | 'producto';

const PAGE_SIZE = 50;

export default function MovimientosPage() {
  return (
    <Suspense fallback={<div className="module-page kardex-page" />}>
      <MovimientosView />
    </Suspense>
  );
}

function MovimientosView() {
  const params = useSearchParams();
  const tabParam = params.get('tab');
  const productoParam = params.get('productoId') ?? '';
  const almacenParam = params.get('almacenId') ?? '';
  const [tab, setTab] = useState<Tab>(tabParam === 'producto' ? 'producto' : 'movimientos');
  useEffect(() => {
    if (tabParam === 'producto') setTab('producto');
  }, [tabParam]);

  const [movimientos, setMovimientos] = useState<Movement[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [productos, setProductos] = useState<CatalogItem[]>([]);
  const [almacenes, setAlmacenes] = useState<CatalogItem[]>([]);

  const [buscar, setBuscar] = useState('');
  const [ref, setRef] = useState(params.get('ref') ?? '');
  const [tipoOperacion, setTipoOperacion] = useState('');
  const [productoId, setProductoId] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [seleccionado, setSeleccionado] = useState<Movement | null>(null);

  useEffect(() => {
    getOperationCatalogs()
      .then((catalogs) => {
        setProductos(catalogs.productos);
        setAlmacenes(catalogs.almacenes);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMovimientos(
        await getMovements({
          from: from || undefined,
          to: to || undefined,
          productoId: productoId || undefined,
          almacenId: almacenId || undefined,
          tipoOperacion: tipoOperacion || undefined,
          ref: ref || undefined,
        }),
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo cargar el kardex');
    } finally {
      setLoading(false);
    }
  }, [almacenId, from, productoId, ref, tipoOperacion, to]);

  useEffect(() => {
    if (tab === 'movimientos') void load();
  }, [load, tab]);

  // Reset to page 1 whenever a filter changes.
  const resetPage = useCallback(() => setPage(1), []);
  const changePeriod = useCallback(
    (start: string, end: string) => {
      setFrom(start);
      setTo(end);
      resetPage();
    },
    [resetPage],
  );

  // Los filtros de fecha/producto/almacén/tipo/ref se aplican en el servidor; aquí solo se
  // refina por texto y se pagina en el cliente, igual que en /ventas.
  const filtradas = useMemo(() => {
    const needle = buscar.trim().toLowerCase();
    if (!needle) return movimientos;
    return movimientos.filter((item) =>
      `${item.referencia} ${item.operacionLabel} ${item.comprobante} ${item.tercero} ${item.origen} ${item.destino}`
        .toLowerCase()
        .includes(needle),
    );
  }, [buscar, movimientos]);

  const pages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const visibles = filtradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = Boolean(
    buscar || ref || tipoOperacion || productoId || almacenId || from || to,
  );

  return (
    <div className="module-page kardex-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Kardex de inventario</h1>
          <span>Historial de entradas y salidas de stock, trazable por documento.</span>
        </div>
      </div>

      <div className="module-tools kardex-tabs">
        <div className="report-period-shortcuts">
          <button
            type="button"
            className={tab === 'movimientos' ? 'active' : ''}
            onClick={() => setTab('movimientos')}
          >
            Movimientos
          </button>
          <button
            type="button"
            className={tab === 'producto' ? 'active' : ''}
            onClick={() => setTab('producto')}
          >
            Kardex por producto
          </button>
        </div>
      </div>

      {tab === 'producto' ? (
        <ProductLedger
          key={`${productoParam}-${almacenParam}`}
          initialProductId={productoParam}
          initialWarehouseId={almacenParam}
        />
      ) : (
        <>
          <div className="module-tools kardex-filters">
            <label className="pill-search">
              <Search size={17} />
              <input
                value={buscar}
                onChange={(event) => {
                  setBuscar(event.target.value);
                  resetPage();
                }}
                placeholder="Buscar documento, referencia o tercero"
              />
            </label>
            <select
              className="filter-pill"
              value={tipoOperacion}
              onChange={(event) => {
                setTipoOperacion(event.target.value);
                resetPage();
              }}
              aria-label="Tipo de movimiento"
            >
              {MOVEMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <SearchableSelect
              value={productoId}
              onChange={(value) => {
                setProductoId(value);
                resetPage();
              }}
              options={[
                { value: '', label: 'Todos los productos' },
                ...productos.map((item) => ({ value: item.id, label: item.nombre })),
              ]}
              placeholder="Producto"
            />
            <SearchableSelect
              value={almacenId}
              onChange={(value) => {
                setAlmacenId(value);
                resetPage();
              }}
              options={[
                { value: '', label: 'Todos los almacenes' },
                ...almacenes.map((item) => ({ value: item.id, label: item.nombre })),
              ]}
              placeholder="Almacén"
            />
          </div>
          <PeriodFilter onChange={changePeriod} />

          {ref ? (
            <div className="kardex-ref-chip">
              Mostrando el movimiento <strong>{ref}</strong>
              <button
                type="button"
                onClick={() => {
                  setRef('');
                  resetPage();
                }}
              >
                <X size={13} /> Quitar
              </button>
            </div>
          ) : null}

          <div className="glass-table">
            <table>
              <thead>
                <tr>
                  <th>Movimiento</th>
                  <th>Qué ocurrió</th>
                  <th>Documento y tercero</th>
                  <th>Ruta del inventario</th>
                  <th>Productos</th>
                  <th>Estado</th>
                  <th>Ver</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="table-loading" role="status">
                        <span className="loading-spinner" /> Cargando movimientos...
                      </div>
                    </td>
                  </tr>
                ) : visibles.length ? (
                  visibles.map((item) => {
                    const style = movementStyle(item.tipo);
                    const Icon = style.icon;
                    return (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.referencia}</strong>
                          <small>{dateTime(item.fecha)}</small>
                        </td>
                        <td>
                          <span className={`status status-${style.tone}`}>
                            <Icon size={13} /> {style.label}
                          </span>
                          <small>{item.operacionLabel}</small>
                        </td>
                        <td>
                          <strong>{item.comprobante}</strong>
                          <small>{item.tercero}</small>
                        </td>
                        <td>
                          <strong>{item.origen}</strong>
                          <small>Hacia: {item.destino}</small>
                        </td>
                        <td>
                          <strong>
                            {item.detalles.length}{' '}
                            {item.detalles.length === 1 ? 'producto' : 'productos'}
                          </strong>
                          <small>{quantity(item.unidades)} unidades en total</small>
                        </td>
                        <td>
                          <span
                            className={`status ${item.estado === 'CONFIRMADO' ? 'status-green' : 'status-amber'}`}
                          >
                            {item.estado === 'CONFIRMADO' ? 'Confirmado' : item.estado}
                          </span>
                        </td>
                        <td>
                          <button
                            className="icon-soft"
                            onClick={() => setSeleccionado(item)}
                            title="Ver cómo cambió el stock"
                            aria-label={`Ver detalle del movimiento ${item.referencia}`}
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <div className="table-empty">
                        <Search size={22} />
                        <span>
                          {hasFilters
                            ? 'No hay movimientos que coincidan con los filtros.'
                            : 'Aún no hay movimientos de inventario registrados.'}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={Math.min(page, pages)}
            pages={pages}
            total={filtradas.length}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        </>
      )}

      {seleccionado ? (
        <MovementDetail movement={seleccionado} onClose={() => setSeleccionado(null)} />
      ) : null}
    </div>
  );
}

function MovementDetail({ movement, onClose }: { movement: Movement; onClose: () => void }) {
  const style = movementStyle(movement.tipo);
  return (
    <div className="modal-backdrop">
      <section
        className="crud-modal kardex-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kardex-detail-title"
      >
        <div className="modal-top">
          <div>
            <h2 id="kardex-detail-title">{movement.referencia}</h2>
            <small>
              {movement.operacionLabel} · {movement.comprobante} · {dateTime(movement.fecha)}
            </small>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="operation-detail kardex-detail">
          <p className="kardex-explanation">{movement.explicacion}</p>
          <div className="kardex-summary-grid">
            <div>
              <FileText size={17} />
              <span>
                Documento<strong>{movement.comprobante}</strong>
                <small>{movement.tercero}</small>
              </span>
            </div>
            <div>
              <Boxes size={17} />
              <span>
                Movimiento<strong>{style.label}</strong>
                <small>{quantity(movement.unidades)} unidades</small>
              </span>
            </div>
            <div>
              <UserRound size={17} />
              <span>
                Responsable<strong>{movement.responsable}</strong>
                <small>{movement.estado === 'CONFIRMADO' ? 'Confirmado' : movement.estado}</small>
              </span>
            </div>
          </div>
          <div className="kardex-route">
            <div>
              <small>Sale de</small>
              <strong>{movement.origen}</strong>
            </div>
            <ArrowRight size={20} />
            <div>
              <small>Llega a</small>
              <strong>{movement.destino}</strong>
            </div>
          </div>
          {movement.observaciones ? (
            <div className="kardex-observation">
              <FileText size={17} />
              <div>
                <strong>Motivo registrado</strong>
                <p>{movement.observaciones}</p>
              </div>
            </div>
          ) : null}
          <div className="kardex-products-heading">
            <Warehouse size={18} />
            <div>
              <strong>Cambio de stock por producto</strong>
              <small>
                Saldo de este producto en ese almacén / lote / estado, antes y después del
                movimiento.
              </small>
            </div>
          </div>
          <div className="kardex-product-list">
            {movement.detalles.map((item, index) => {
              const entry = item.direccion === 'ENTRADA';
              return (
                <article className="kardex-product-card" key={`${item.producto}-${index}`}>
                  <div className="kardex-product-head">
                    <div>
                      <strong>{item.producto}</strong>
                      <small>
                        {item.codigo || 'Sin código'} · {item.almacen} · {item.lote}
                      </small>
                      <Link
                        className="kardex-link"
                        href={`/movimientos?tab=producto&productoId=${item.productoId}&almacenId=${item.almacenId}`}
                        onClick={onClose}
                      >
                        Ver kardex de este producto
                      </Link>
                    </div>
                    <span className={`status ${entry ? 'status-green' : 'status-blue'}`}>
                      {entry ? '+' : '−'}
                      {quantity(item.cantidad)} · {directionLabel(item.direccion)}
                    </span>
                  </div>
                  <div className="kardex-balance-equation">
                    <div>
                      <small>Saldo anterior</small>
                      <strong>{quantity(item.saldoAnterior)}</strong>
                    </div>
                    <span className={entry ? 'entry' : 'exit'}>
                      {entry ? '+' : '−'} {quantity(item.cantidad)}
                    </span>
                    <div>
                      <small>Saldo posterior</small>
                      <strong>{quantity(item.saldoPosterior)}</strong>
                    </div>
                  </div>
                  <div className="kardex-product-meta">
                    <span>
                      Estado: <strong>{item.estadoInventario}</strong>
                    </span>
                    <span>
                      Costo unitario: <strong>{money(item.costoUnitario)}</strong>
                    </span>
                    <span>
                      Valor movido: <strong>{money(item.costoTotal)}</strong>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
