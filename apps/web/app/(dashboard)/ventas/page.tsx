'use client';

import { Check, Eye, Plus, Printer, Search, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { OperationDetailDialog } from '../../../components/operations/OperationDetailDialog';
import { RegisterCollectionModal } from '../../../components/operations/RegisterCollectionModal';
import { SaleReceipt } from '../../../components/operations/SaleReceipt';
import { Pagination } from '../../../components/Pagination';
import { PeriodFilter } from '../../../components/PeriodFilter';
import { money } from '../../../lib/format';
import {
  confirmSale,
  getOperationalAccounts,
  getOperationalPaymentMethods,
  getSales,
  OperationalAccount,
  OperationalPaymentMethod,
  Sale,
} from '../../../lib/operations';
import { puedeEditar } from '../../../lib/permissions';
import { useRole } from '../../../lib/useCurrentUser';

export default function VentasPage() {
  const [ventas, setVentas] = useState<Sale[]>([]);
  const [buscar, setBuscar] = useState('');
  const [pago, setPago] = useState('Todos');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detalle, setDetalle] = useState<Sale | null>(null);
  const [boleta, setBoleta] = useState<Sale | null>(null);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [receivables, setReceivables] = useState<OperationalAccount[]>([]);
  const [methods, setMethods] = useState<OperationalPaymentMethod[]>([]);
  const [cobrarAccount, setCobrarAccount] = useState<OperationalAccount | null>(null);
  const role = useRole();
  // DELIVERY solo crea y lee ventas: sin confirmar, sin cobranzas, sin resumen por cobrar.
  const editable = puedeEditar(role);

  const loadReceivables = useCallback(async () => {
    try {
      const [accounts, paymentMethods] = await Promise.all([
        getOperationalAccounts('cobrar'),
        getOperationalPaymentMethods(),
      ]);
      setReceivables(accounts);
      setMethods(paymentMethods);
    } catch {
      /* el resumen por cobrar es informativo; no bloquea la lista de ventas */
    }
  }, []);

  useEffect(() => {
    if (role && puedeEditar(role)) void loadReceivables();
  }, [role, loadReceivables]);

  const porCobrarTotal = receivables.reduce((sum, item) => sum + item.saldo, 0);
  const vencidasCount = receivables.filter((item) => item.estado === 'VENCIDA').length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVentas(await getSales(from || undefined, to || undefined));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar las ventas', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (from && to) void load();
  }, [from, load, to]);

  // The date window is applied server-side (getSales(from, to)); here we only refine by
  // payment type and text search.
  const filtradas = useMemo(
    () =>
      ventas.filter(
        (item) =>
          (pago === 'Todos' || item.pago === pago) &&
          `${item.codigo} ${item.cliente} ${item.almacen}`
            .toLowerCase()
            .includes(buscar.toLowerCase()),
      ),
    [buscar, pago, ventas],
  );
  const pages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const visibles = filtradas.slice((pagina - 1) * pageSize, pagina * pageSize);
  const confirmed = filtradas.filter((item) => item.estado === 'CONFIRMADA');

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
    try {
      const updated = await confirmSale(id);
      setVentas((current) => current.map((item) => (item.id === id ? updated : item)));
      toast.success(`Venta confirmada · ${updated.codigo}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo confirmar la venta', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
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
          <p>Consulta ventas, pagos y salidas de inventario.</p>
        </div>
        <Link className="btn-primary operation-primary-action" href="/ventas/nueva">
          <Plus size={18} /> Nueva venta
        </Link>
      </div>
      <div className="summary-row">
        <div className="summary-glass">
          <span>Ventas confirmadas</span>
          <strong>{money(confirmed.reduce((sum, item) => sum + item.totalNeto, 0))}</strong>
        </div>
        <div className="summary-glass">
          <span>Cobrado</span>
          <strong>{money(confirmed.reduce((sum, item) => sum + item.pagado, 0))}</strong>
        </div>
        {editable ? (
          <Link className="summary-glass summary-glass-link" href="/cobranzas">
            <span>Por cobrar (total)</span>
            <strong>{money(porCobrarTotal)}</strong>
            <small>
              {vencidasCount > 0 ? `${vencidasCount} vencidas · ir a Cobranzas` : 'Ir a Cobranzas'}
            </small>
          </Link>
        ) : null}
        <div className="summary-glass">
          <span>Con kardex</span>
          <strong>{confirmed.filter((item) => item.kardexId).length}</strong>
        </div>
      </div>

      <div className="module-tools operations-filters">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => changeFilters(() => setBuscar(event.target.value))}
            placeholder="Buscar venta, cliente o almacen"
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
          <p>Registra la primera venta para comenzar a controlar tus ventas e inventario.</p>
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
                  <th>Venta</th>
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
                        <small>{new Date(item.fecha).toLocaleString('es-PE')}</small>
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
                        <small>Saldo {money(item.saldo)}</small>
                      </td>
                      <td>
                        <strong>{money(item.total)}</strong>
                        <small>Neto {money(item.totalNeto)}</small>
                      </td>
                      <td>
                        {item.kardexId ? (
                          <Link
                            className="kardex-link"
                            href={`/movimientos?ref=${encodeURIComponent(item.kardexRef ?? '')}`}
                          >
                            <Check size={13} /> {item.kardexRef ?? 'Ver kardex'}
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
                            aria-label={`Ver ${item.codigo}`}
                          >
                            <Eye size={16} />
                          </button>
                          {item.estado === 'CONFIRMADA' ? (
                            <button
                              type="button"
                              className="icon-soft"
                              onClick={() => setBoleta(item)}
                              title="Imprimir venta"
                              aria-label={`Imprimir ${item.codigo}`}
                            >
                              <Printer size={16} />
                            </button>
                          ) : null}
                          {editable && item.estado === 'BORRADOR' ? (
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
          title={detalle.codigo}
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
          kardexRef={detalle.kardexRef}
          items={detalle.items}
          onClose={() => setDetalle(null)}
          onRegisterCollection={
            editable && detalle.saldo > 0 && detalle.cuentaCobrarId
              ? () => {
                  const account = receivables.find((item) => item.id === detalle.cuentaCobrarId);
                  if (!account) {
                    toast.error('No se encontró la cuenta por cobrar de esta venta.');
                    return;
                  }
                  setCobrarAccount(account);
                  setDetalle(null);
                }
              : undefined
          }
        />
      ) : null}

      {cobrarAccount ? (
        <RegisterCollectionModal
          tipo="cobrar"
          cuenta={cobrarAccount}
          metodos={methods}
          onClose={() => setCobrarAccount(null)}
          onDone={(updated) => {
            setReceivables((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            );
            setCobrarAccount(null);
            void load();
          }}
        />
      ) : null}

      {boleta ? <SaleReceipt sale={boleta} onClose={() => setBoleta(null)} /> : null}
    </div>
  );
}
