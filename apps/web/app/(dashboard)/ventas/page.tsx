'use client';

import { Check, Eye, Plus, Search, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { OperationDetailDialog } from '../../../components/operations/OperationDetailDialog';
import { Pagination } from '../../../components/Pagination';
import { PeriodFilter } from '../../../components/PeriodFilter';
import { confirmSale, getSales, Sale } from '../../../lib/operations';

export default function VentasPage() {
  const [ventas, setVentas] = useState<Sale[]>([]);
  const [buscar, setBuscar] = useState('');
  const [pago, setPago] = useState('Todos');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detalle, setDetalle] = useState<Sale | null>(null);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setVentas(await getSales());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las ventas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const feedback = sessionStorage.getItem('torito-operation-feedback');
    if (feedback) {
      setMessage(feedback);
      sessionStorage.removeItem('torito-operation-feedback');
    }
  }, [load]);

  const filtradas = useMemo(
    () =>
      ventas.filter((item) => {
        const fecha = item.fecha.slice(0, 10);
        return (
          (pago === 'Todos' || item.pago === pago) &&
          (!from || fecha >= from) &&
          (!to || fecha <= to) &&
          `${item.comprobante} ${item.cliente} ${item.almacen}`
            .toLowerCase()
            .includes(buscar.toLowerCase())
        );
      }),
    [buscar, from, pago, to, ventas],
  );
  const pages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const visibles = filtradas.slice((pagina - 1) * pageSize, pagina * pageSize);
  const confirmed = ventas.filter((item) => item.estado === 'CONFIRMADA');

  function changeFilters(action: () => void) {
    action();
    setPagina(1);
  }
  const changePeriod = useCallback((start: string, end: string) => {
    setFrom(start);
    setTo(end);
    setPagina(1);
  }, []);
  async function confirmar(id: string) {
    setProcesandoId(id);
    setError('');
    setMessage('');
    try {
      const updated = await confirmSale(id);
      setVentas((current) => current.map((item) => (item.id === id ? updated : item)));
      setMessage('Venta confirmada correctamente.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo confirmar la venta');
    } finally {
      setProcesandoId(null);
    }
  }

  return (
    <div className="module-page operations-list-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Operaciones</span>
          <h1>Ventas</h1>
          <p>Consulta comprobantes, pagos y salidas de inventario.</p>
        </div>
        <Link className="btn-primary operation-primary-action" href="/ventas/nueva">
          <Plus size={18} /> Nueva venta
        </Link>
      </div>
      <div className="summary-row">
        <div className="summary-glass">
          <span>Ventas confirmadas</span>
          <strong>S/ {confirmed.reduce((sum, item) => sum + item.total, 0).toFixed(2)}</strong>
        </div>
        <div className="summary-glass">
          <span>Cobrado</span>
          <strong>
            S/ {confirmed.reduce((sum, item) => sum + item.total - item.saldo, 0).toFixed(2)}
          </strong>
        </div>
        <div className="summary-glass">
          <span>Por cobrar</span>
          <strong>S/ {confirmed.reduce((sum, item) => sum + item.saldo, 0).toFixed(2)}</strong>
        </div>
        <div className="summary-glass">
          <span>Con kardex</span>
          <strong>{confirmed.filter((item) => item.kardexId).length}</strong>
        </div>
      </div>

      {message ? (
        <div className="notice-success" role="status">
          <Check size={17} /> {message}
          <button type="button" onClick={() => setMessage('')} aria-label="Cerrar mensaje">
            ×
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="notice-error" role="alert">
          {error}
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      ) : null}

      <div className="module-tools operations-filters">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => changeFilters(() => setBuscar(event.target.value))}
            placeholder="Buscar comprobante, cliente o almacen"
          />
        </label>
        <label className="filter-field">
          <span>Tipo de pago</span>
          <select
            className="filter-pill"
            value={pago}
            onChange={(event) => changeFilters(() => setPago(event.target.value))}
          >
            <option>Todos</option>
            <option>CONTADO</option>
            <option>CREDITO</option>
            <option>MIXTO</option>
          </select>
        </label>
      </div>
      <PeriodFilter onChange={changePeriod} />

      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando ventas...
        </div>
      ) : ventas.length === 0 ? (
        <div className="empty-state">
          <ShoppingCart size={34} />
          <h2>Aun no hay ventas</h2>
          <p>Registra la primera venta para comenzar a controlar comprobantes e inventario.</p>
          <Link className="btn-primary" href="/ventas/nueva">
            <Plus size={17} /> Registrar venta
          </Link>
        </div>
      ) : (
        <>
          <div className="glass-table">
            <table>
              <thead>
                <tr>
                  <th>Venta / comprobante</th>
                  <th>Cliente</th>
                  <th>Origen</th>
                  <th>Pago</th>
                  <th>Total / neto</th>
                  <th>Inventario</th>
                  <th>Estados</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length ? (
                  visibles.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.codigo}</strong>
                        <small>
                          {item.comprobante} · {new Date(item.fecha).toLocaleString('es-PE')}
                        </small>
                      </td>
                      <td>{item.cliente}</td>
                      <td>{item.almacen}</td>
                      <td>
                        <span
                          className={
                            item.estadoPago === 'PAGADA'
                              ? 'status status-green'
                              : 'status status-amber'
                          }
                        >
                          {item.estadoPago}
                        </span>
                        <small>Saldo S/ {item.saldo.toFixed(2)}</small>
                      </td>
                      <td>
                        <strong>S/ {item.total.toFixed(2)}</strong>
                        <small>Neto S/ {item.totalNeto.toFixed(2)}</small>
                      </td>
                      <td>
                        {item.kardexId ? (
                          <Link className="kardex-link" href="/movimientos">
                            <Check size={13} /> Kardex #{item.kardexId}
                          </Link>
                        ) : (
                          <span className="status status-amber">Pendiente</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            item.estado === 'CONFIRMADA'
                              ? 'status status-green'
                              : 'status status-amber'
                          }
                        >
                          {item.estado}
                        </span>
                        <small>{item.estadoDevolucion.replaceAll('_', ' ')}</small>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-soft"
                            onClick={() => setDetalle(item)}
                            title="Ver venta"
                            aria-label={`Ver ${item.comprobante}`}
                          >
                            <Eye size={16} />
                          </button>
                          {item.estado === 'BORRADOR' ? (
                            <button
                              type="button"
                              className="confirm-soft"
                              disabled={procesandoId === item.id}
                              onClick={() => void confirmar(item.id)}
                            >
                              <Check size={15} />{' '}
                              {procesandoId === item.id ? 'Confirmando...' : 'Confirmar'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <div className="table-empty">
                        <Search size={22} />
                        <span>No hay ventas que coincidan con los filtros.</span>
                        <button
                          type="button"
                          onClick={() => {
                            setBuscar('');
                            setPago('Todos');
                          }}
                        >
                          Limpiar filtros
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={Math.min(pagina, pages)}
            pages={pages}
            total={filtradas.length}
            pageSize={pageSize}
            onChange={setPagina}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPagina(1);
            }}
          />
        </>
      )}

      {detalle ? (
        <OperationDetailDialog
          title={`${detalle.codigo} · ${detalle.comprobante}`}
          partyLabel="Cliente"
          party={detalle.cliente}
          warehouseLabel="Almacen origen"
          warehouse={detalle.almacen}
          status={detalle.estado}
          total={detalle.total}
          netTotal={detalle.totalNeto}
          paid={detalle.pagado}
          balance={detalle.saldo}
          paymentStatus={detalle.estadoPago}
          dueDate={detalle.fechaVencimiento}
          returnStatus={detalle.estadoDevolucion}
          kardexId={detalle.kardexId}
          items={detalle.items}
          onClose={() => setDetalle(null)}
        />
      ) : null}
    </div>
  );
}
