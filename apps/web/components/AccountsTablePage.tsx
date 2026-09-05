'use client';

import {
  CalendarClock,
  ChevronDown,
  Download,
  Eye,
  Plus,
  Search,
  TriangleAlert,
  WalletCards,
  X,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { estadoCuentaLabel, resumenVencimiento } from '../lib/credit';
import { moneda } from '../lib/format';
import {
  getOperationalAccounts,
  getOperationalPaymentMethods,
  OperationalAccount,
  OperationalPaymentMethod,
  updateReceivableDueDate,
} from '../lib/operations';
import { Pagination } from './Pagination';
import { RegisterCollectionModal } from './operations/RegisterCollectionModal';

const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(value))
    : 'Sin fecha';

const daysToDue = (value: string | null) => {
  if (!value) return null;
  const start = new Date(`${today()}T00:00:00.000Z`).getTime();
  const end = new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000);
};

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

type ClientGroup = {
  clienteKey: string;
  tercero: string;
  documento: string;
  cuentas: OperationalAccount[];
  saldo: number;
  vencido: number;
  vencidas: number;
  proximoVencimiento: string | null;
};

export function AccountsTablePage({ tipo }: { tipo: 'cobrar' | 'pagar' }) {
  const payable = tipo === 'pagar';
  const tercero = payable ? 'Proveedor' : 'Cliente';
  const searchParams = useSearchParams();
  const clienteParam = payable ? null : searchParams.get('cliente');

  const [cuentas, setCuentas] = useState<OperationalAccount[]>([]);
  const [metodos, setMetodos] = useState<OperationalPaymentMethod[]>([]);
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todas');
  const [vista, setVista] = useState<'comprobante' | 'cliente'>(
    payable ? 'comprobante' : 'cliente',
  );
  const [expandido, setExpandido] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagoCuentaId, setPagoCuentaId] = useState<string | null>(null);
  const [historialId, setHistorialId] = useState<string | null>(null);
  const [programarId, setProgramarId] = useState<string | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState(today);
  const [loading, setLoading] = useState(true);
  const [savingDate, setSavingDate] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getOperationalAccounts(tipo, clienteParam ?? undefined),
      getOperationalPaymentMethods(),
    ])
      .then(([accountRows, methodRows]) => {
        setCuentas(accountRows);
        setMetodos(methodRows);
      })
      .catch((cause) =>
        toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar las cuentas'),
      )
      .finally(() => setLoading(false));
  }, [tipo, clienteParam]);

  const pagoCuenta = cuentas.find((item) => item.id === pagoCuentaId) ?? null;
  const historial = cuentas.find((item) => item.id === historialId) ?? null;
  const programar = cuentas.find((item) => item.id === programarId) ?? null;

  const visibles = useMemo(
    () =>
      cuentas
        .filter((item) => {
          const days = daysToDue(item.vencimiento);
          const statusMatches =
            estado === 'Todas' ||
            item.estado === estado ||
            (estado === 'POR_VENCER' &&
              item.saldo > 0 &&
              days !== null &&
              days >= 0 &&
              days <= 7) ||
            (estado === 'SIN_FECHA' && item.saldo > 0 && days === null);
          return (
            statusMatches &&
            `${item.tercero} ${item.documento} ${item.comprobante}`
              .toLowerCase()
              .includes(buscar.toLowerCase())
          );
        })
        .sort((a, b) => {
          if (a.saldo > 0 !== b.saldo > 0) return a.saldo > 0 ? -1 : 1;
          if (!a.vencimiento && b.vencimiento) return 1;
          if (a.vencimiento && !b.vencimiento) return -1;
          return (a.vencimiento ?? '').localeCompare(b.vencimiento ?? '');
        }),
    [buscar, cuentas, estado],
  );

  const grupos = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>();
    for (const cuenta of visibles) {
      const key = `${cuenta.tercero}__${cuenta.documento}`;
      const group =
        map.get(key) ??
        ({
          clienteKey: key,
          tercero: cuenta.tercero,
          documento: cuenta.documento,
          cuentas: [],
          saldo: 0,
          vencido: 0,
          vencidas: 0,
          proximoVencimiento: null,
        } as ClientGroup);
      group.cuentas.push(cuenta);
      group.saldo += cuenta.saldo;
      if (cuenta.estado === 'VENCIDA') {
        group.vencido += cuenta.saldo;
        group.vencidas += 1;
      }
      if (
        cuenta.saldo > 0 &&
        cuenta.vencimiento &&
        (!group.proximoVencimiento || cuenta.vencimiento < group.proximoVencimiento)
      )
        group.proximoVencimiento = cuenta.vencimiento;
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => b.saldo - a.saldo);
  }, [visibles]);

  const filas = vista === 'cliente' && !payable ? grupos : visibles;
  const pages = Math.max(1, Math.ceil(filas.length / pageSize));
  const currentPage = Math.min(pagina, pages);
  const paginadas = filas.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pendientes = cuentas.filter((item) => item.saldo > 0);
  const vencidas = pendientes.filter((item) => item.estado === 'VENCIDA');
  const porVencer = pendientes.filter((item) => {
    const days = daysToDue(item.vencimiento);
    return days !== null && days >= 0 && days <= 7;
  });
  const sinFecha = pendientes.filter((item) => !item.vencimiento);
  const saldoTotal = pendientes.reduce((total, item) => total + item.saldo, 0);
  const vencidoTotal = vencidas.reduce((total, item) => total + item.saldo, 0);
  const currentMonth = today().slice(0, 7);
  const paidThisMonth = cuentas
    .flatMap((item) => item.pagos)
    .filter((payment) => payment.fecha.slice(0, 7) === currentMonth)
    .reduce((total, payment) => total + payment.monto, 0);

  function setScheduleFilter(value: string) {
    setEstado(value);
    setPagina(1);
  }

  function abrirPago(item?: OperationalAccount) {
    const account = item ?? pendientes[0];
    if (!account) {
      toast.error('No existen cuentas con saldo pendiente.');
      return;
    }
    setPagoCuentaId(account.id);
  }

  function aplicarActualizacion(updated: OperationalAccount) {
    setCuentas((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  function exportar() {
    const header = [
      tercero,
      'Documento',
      'Comprobante',
      'Emisión',
      'Vencimiento',
      'Monto original',
      'Pagado',
      'Saldo',
      'Estado',
    ];
    const rows = visibles.map((item) => [
      item.tercero,
      item.documento,
      item.comprobante,
      formatDate(item.emision),
      formatDate(item.vencimiento),
      item.original.toFixed(2),
      item.pagado.toFixed(2),
      item.saldo.toFixed(2),
      estadoCuentaLabel[item.estado] ?? item.estado,
    ]);
    const csv = `﻿${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${payable ? 'cuentas-por-pagar' : 'cobranzas'}-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function guardarFecha(event: FormEvent) {
    event.preventDefault();
    if (!programar) return;
    setSavingDate(true);
    try {
      const updated = await updateReceivableDueDate(programar.id, nuevaFecha);
      aplicarActualizacion(updated);
      toast.success('Fecha de vencimiento programada.');
      setProgramarId(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo programar la fecha');
    } finally {
      setSavingDate(false);
    }
  }

  useEffect(() => {
    if (!historialId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHistorialId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [historialId]);

  function renderAccountRow(item: OperationalAccount, nested = false) {
    const due = resumenVencimiento(item.vencimiento, item.saldo);
    return (
      <tr key={item.id} className={nested ? 'account-nested-row' : undefined}>
        <td>
          <strong>{item.tercero}</strong>
          <small>{item.documento}</small>
        </td>
        <td>{item.comprobante}</td>
        <td>{formatDate(item.emision)}</td>
        <td>{formatDate(item.vencimiento)}</td>
        <td>
          <span className={`due-state ${due.tone}`}>{due.label}</span>
          <small>{estadoCuentaLabel[item.estado] ?? item.estado}</small>
        </td>
        <td>{moneda(item.original)}</td>
        <td>{moneda(item.pagado)}</td>
        <td>
          <strong>{moneda(item.saldo)}</strong>
        </td>
        <td>
          <div className="row-actions">
            <button
              className="icon-soft"
              onClick={() => abrirPago(item)}
              title={payable ? 'Registrar pago' : 'Registrar cobro'}
              aria-label={`Registrar pago de ${item.comprobante}`}
              disabled={item.saldo <= 0}
            >
              <WalletCards size={16} />
            </button>
            {!payable && item.saldo > 0 ? (
              <button
                className="icon-soft"
                title="Programar vencimiento"
                aria-label={`Programar vencimiento de ${item.comprobante}`}
                onClick={() => {
                  setProgramarId(item.id);
                  setNuevaFecha(item.vencimiento?.slice(0, 10) ?? today());
                }}
              >
                <CalendarClock size={16} />
              </button>
            ) : null}
            <button
              className="icon-soft"
              title="Ver historial"
              aria-label={`Ver historial de ${item.comprobante}`}
              onClick={() => setHistorialId(item.id)}
            >
              <Eye size={16} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="module-page accounts-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Caja y cuentas</span>
          <h1>{payable ? 'Cuentas por pagar' : 'Cobranzas'}</h1>
          <p>
            {payable
              ? 'Prioriza vencimientos, programa saldos y registra abonos a proveedores.'
              : 'Todo lo que te deben los clientes: saldos, vencimientos y cobros, en un solo lugar.'}
          </p>
        </div>
        <button
          className="btn-primary operation-primary-action"
          onClick={() => abrirPago()}
          disabled={loading || !pendientes.length}
        >
          <Plus size={18} /> {payable ? 'Registrar pago' : 'Registrar cobro'}
        </button>
      </div>

      <div className="summary-row">
        <div className="summary-glass">
          <span>{payable ? 'Saldo por pagar' : 'Total por cobrar'}</span>
          <strong>{moneda(saldoTotal)}</strong>
        </div>
        <div className="summary-glass">
          <span>Saldo vencido</span>
          <strong>{moneda(vencidoTotal)}</strong>
        </div>
        <div className="summary-glass">
          <span>Vence en 7 días</span>
          <strong>{porVencer.length}</strong>
        </div>
        <div className="summary-glass">
          <span>{payable ? 'Pagado' : 'Cobrado'} este mes</span>
          <strong>{moneda(paidThisMonth)}</strong>
        </div>
      </div>

      <section className="account-agenda" aria-label="Agenda de vencimientos">
        <button
          className={estado === 'VENCIDA' ? 'active danger' : 'danger'}
          type="button"
          onClick={() => setScheduleFilter(estado === 'VENCIDA' ? 'Todas' : 'VENCIDA')}
        >
          <TriangleAlert size={18} />
          <span>
            <strong>{vencidas.length} vencidas</strong>
            <small>{moneda(vencidoTotal)} por regularizar</small>
          </span>
        </button>
        <button
          className={estado === 'POR_VENCER' ? 'active warning' : 'warning'}
          type="button"
          onClick={() => setScheduleFilter(estado === 'POR_VENCER' ? 'Todas' : 'POR_VENCER')}
        >
          <CalendarClock size={18} />
          <span>
            <strong>{porVencer.length} próximas</strong>
            <small>Vencen dentro de 7 días</small>
          </span>
        </button>
        <button
          className={estado === 'SIN_FECHA' ? 'active neutral' : 'neutral'}
          type="button"
          onClick={() => setScheduleFilter(estado === 'SIN_FECHA' ? 'Todas' : 'SIN_FECHA')}
        >
          <CalendarClock size={18} />
          <span>
            <strong>{sinFecha.length} sin fecha</strong>
            <small>Requieren programación</small>
          </span>
        </button>
      </section>

      <div className="module-tools account-filters">
        {!payable ? (
          <div className="account-view-toggle" role="group" aria-label="Agrupar cuentas">
            <button
              type="button"
              className={vista === 'cliente' ? 'active' : ''}
              onClick={() => {
                setVista('cliente');
                setPagina(1);
              }}
            >
              Por cliente
            </button>
            <button
              type="button"
              className={vista === 'comprobante' ? 'active' : ''}
              onClick={() => {
                setVista('comprobante');
                setPagina(1);
              }}
            >
              Por comprobante
            </button>
          </div>
        ) : null}
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => {
              setBuscar(event.target.value);
              setPagina(1);
            }}
            placeholder={`Buscar ${tercero.toLowerCase()} o comprobante`}
          />
        </label>
        <select
          className="filter-pill"
          value={estado}
          onChange={(event) => setScheduleFilter(event.target.value)}
          aria-label="Filtrar por situación"
        >
          <option value="Todas">Todas las situaciones</option>
          <option value="POR_VENCER">Por vencer (7 días)</option>
          <option value="VENCIDA">Vencidas</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="PARCIAL">Con pago parcial</option>
          <option value="PAGADA">Pagadas</option>
          <option value="SIN_FECHA">Sin fecha programada</option>
        </select>
        <button
          type="button"
          className="report-export-button"
          onClick={exportar}
          disabled={!visibles.length}
        >
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      <div className="glass-table">
        <table>
          <thead>
            <tr>
              <th>{tercero}</th>
              <th>Comprobante</th>
              <th>Emisión</th>
              <th>Vencimiento</th>
              <th>Situación</th>
              <th>Monto original</th>
              <th>Pagado</th>
              <th>Saldo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9}>
                  <div className="table-empty">
                    <span className="loading-spinner" /> Cargando cuentas...
                  </div>
                </td>
              </tr>
            ) : !paginadas.length ? (
              <tr>
                <td colSpan={9}>
                  <div className="table-empty">No hay cuentas que coincidan con los filtros.</div>
                </td>
              </tr>
            ) : vista === 'cliente' && !payable ? (
              (paginadas as ClientGroup[]).flatMap((group) => {
                const abierto = expandido === group.clienteKey;
                return [
                  <tr
                    key={group.clienteKey}
                    className={`account-group-row${abierto ? ' open' : ''}`}
                    onClick={() =>
                      setExpandido((current) =>
                        current === group.clienteKey ? null : group.clienteKey,
                      )
                    }
                  >
                    <td>
                      <button type="button" className="account-group-toggle">
                        <ChevronDown size={15} className={abierto ? 'rotated' : ''} />
                        <span>
                          <strong>{group.tercero}</strong>
                          <small>{group.documento}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      {group.cuentas.length}{' '}
                      {group.cuentas.length === 1 ? 'comprobante' : 'comprobantes'}
                    </td>
                    <td colSpan={2}>
                      {group.proximoVencimiento
                        ? `Próximo vence ${formatDate(group.proximoVencimiento)}`
                        : 'Sin fecha programada'}
                    </td>
                    <td>
                      {group.vencidas > 0 ? (
                        <span className="due-state overdue">{group.vencidas} vencidas</span>
                      ) : (
                        <span className="due-state scheduled">Al día</span>
                      )}
                    </td>
                    <td colSpan={2} />
                    <td>
                      <strong>{moneda(group.saldo)}</strong>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-soft"
                          title="Registrar cobro"
                          aria-label={`Registrar cobro de ${group.tercero}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            abrirPago(group.cuentas.find((item) => item.saldo > 0));
                          }}
                        >
                          <WalletCards size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>,
                  ...(abierto ? group.cuentas.map((item) => renderAccountRow(item, true)) : []),
                ];
              })
            ) : (
              (paginadas as OperationalAccount[]).map((item) => renderAccountRow(item))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={currentPage}
        pages={pages}
        total={filas.length}
        pageSize={pageSize}
        onChange={setPagina}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPagina(1);
        }}
      />

      {pagoCuenta ? (
        <RegisterCollectionModal
          tipo={tipo}
          cuenta={pagoCuenta}
          cuentas={cuentas}
          metodos={metodos}
          onClose={() => setPagoCuentaId(null)}
          onDone={(updated) => {
            aplicarActualizacion(updated);
            setPagoCuentaId(null);
            setPagina(1);
          }}
        />
      ) : null}

      {programar ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setProgramarId(null)}
        >
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="due-modal-title"
          >
            <div className="modal-top">
              <div>
                <h2 id="due-modal-title">Programar vencimiento</h2>
                <small>
                  {programar.tercero} · {programar.comprobante}
                </small>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setProgramarId(null)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={guardarFecha}>
              <label className="field-wide">
                <span>¿Cuándo pagará el cliente?</span>
                <input
                  type="date"
                  min={today()}
                  value={nuevaFecha}
                  onChange={(event) => setNuevaFecha(event.target.value)}
                  required
                />
              </label>
              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setProgramarId(null)}
                  disabled={savingDate}
                >
                  Cancelar
                </button>
                <button className="btn-primary" disabled={savingDate}>
                  {savingDate ? 'Guardando...' : 'Guardar fecha'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {historial ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setHistorialId(null)}
        >
          <section
            className="crud-modal account-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-modal-title"
          >
            <div className="modal-top">
              <div>
                <h2 id="history-modal-title">Historial de {payable ? 'pagos' : 'cobros'}</h2>
                <small>
                  {historial.tercero} · {historial.comprobante}
                </small>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setHistorialId(null)}
                aria-label="Cerrar historial"
              >
                <X size={18} />
              </button>
            </div>
            <div className="account-history-body">
              <div className="payment-balance-preview">
                <span>
                  Monto original <strong>{moneda(historial.original)}</strong>
                </span>
                <span>
                  Saldo pendiente <strong>{moneda(historial.saldo)}</strong>
                </span>
              </div>
              {historial.pagos.length ? (
                <div className="account-payment-list">
                  {historial.pagos.map((payment) => (
                    <article key={payment.id}>
                      <div>
                        <strong>{payment.metodo}</strong>
                        <small>
                          {formatDate(payment.fecha)} · {payment.trabajador}
                        </small>
                        {payment.numeroOperacion ? (
                          <small>Operación: {payment.numeroOperacion}</small>
                        ) : null}
                      </div>
                      <strong>{moneda(payment.monto)}</strong>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="table-empty">
                  Todavía no se registran {payable ? 'pagos' : 'cobros'} para esta cuenta.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
