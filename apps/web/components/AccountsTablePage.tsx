'use client';

import {
  CalendarClock,
  Download,
  Eye,
  Plus,
  Search,
  TriangleAlert,
  WalletCards,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  getOperationalAccounts,
  getOperationalPaymentMethods,
  OperationalAccount,
  OperationalPaymentMethod,
  registerOperationalPayment,
} from '../lib/operations';
import { Pagination } from './Pagination';

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

function dueMeta(account: OperationalAccount) {
  if (account.saldo <= 0)
    return { label: 'Pagada', detail: 'Saldo cancelado', className: 'due-state paid' };
  const days = daysToDue(account.vencimiento);
  if (days === null)
    return { label: 'Sin fecha', detail: 'Requiere programación', className: 'due-state undated' };
  if (days < 0)
    return {
      label: `${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'} vencida`,
      detail: account.estado,
      className: 'due-state overdue',
    };
  if (days === 0)
    return { label: 'Vence hoy', detail: account.estado, className: 'due-state today' };
  if (days <= 7)
    return {
      label: `Vence en ${days} ${days === 1 ? 'día' : 'días'}`,
      detail: account.estado,
      className: 'due-state soon',
    };
  return { label: `En ${days} días`, detail: account.estado, className: 'due-state scheduled' };
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function AccountsTablePage({ tipo }: { tipo: 'cobrar' | 'pagar' }) {
  const payable = tipo === 'pagar';
  const tercero = payable ? 'Proveedor' : 'Cliente';
  const [cuentas, setCuentas] = useState<OperationalAccount[]>([]);
  const [metodos, setMetodos] = useState<OperationalPaymentMethod[]>([]);
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todas');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState<'pago' | 'historial' | null>(null);
  const [cuentaId, setCuentaId] = useState('');
  const [metodoId, setMetodoId] = useState('');
  const [monto, setMonto] = useState('');
  const [fechaPago, setFechaPago] = useState(today);
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([getOperationalAccounts(tipo), getOperationalPaymentMethods()])
      .then(([accountRows, methodRows]) => {
        setCuentas(accountRows);
        setMetodos(methodRows);
        setMetodoId(methodRows[0]?.id ?? '');
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las cuentas'),
      )
      .finally(() => setLoading(false));
  }, [tipo]);

  const seleccionada = cuentas.find((item) => item.id === cuentaId) ?? null;
  const metodoSeleccionado = metodos.find((item) => item.id === metodoId);
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
  const pages = Math.max(1, Math.ceil(visibles.length / pageSize));
  const currentPage = Math.min(pagina, pages);
  const paginadas = visibles.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pendientes = cuentas.filter((item) => item.saldo > 0);
  const vencidas = pendientes.filter(
    (item) => (daysToDue(item.vencimiento) ?? 0) < 0 && item.vencimiento,
  );
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
    const account = item ?? cuentas.find((row) => row.saldo > 0);
    if (!account) {
      setError('No existen cuentas con saldo pendiente.');
      return;
    }
    setCuentaId(account.id);
    setMetodoId((current) => current || metodos[0]?.id || '');
    setMonto(account.saldo.toFixed(2));
    setFechaPago(today());
    setNumeroOperacion('');
    setObservaciones('');
    setError('');
    setModal('pago');
  }

  function seleccionarCuenta(id: string) {
    setCuentaId(id);
    const account = cuentas.find((item) => item.id === id);
    setMonto(account?.saldo.toFixed(2) ?? '');
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
      item.estado,
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${payable ? 'cuotas-por-pagar' : 'cuentas-por-cobrar'}-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (!seleccionada || !metodoId) return;
    const amount = Number(monto);
    if (!Number.isFinite(amount) || amount <= 0 || amount > seleccionada.saldo) {
      setError(`El monto debe ser mayor a cero y no superar S/ ${seleccionada.saldo.toFixed(2)}.`);
      return;
    }
    if (metodoSeleccionado?.requiereOperacion && !numeroOperacion.trim()) {
      setError(`Ingresa el número de operación para ${metodoSeleccionado.nombre}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await registerOperationalPayment(tipo, {
        cuentaId: Number(seleccionada.id),
        metodoPagoId: Number(metodoId),
        monto: amount,
        fechaPago,
        numeroOperacion: numeroOperacion.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
      });
      setCuentas((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSuccess(`Pago de S/ ${amount.toFixed(2)} registrado correctamente.`);
      setPagina(1);
      setModal(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el pago');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="module-page accounts-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Caja y cuentas</span>
          <h1>{payable ? 'Cuotas por pagar' : 'Cuentas por cobrar'}</h1>
          <p>
            {payable
              ? 'Prioriza vencimientos, programa saldos y registra abonos a proveedores.'
              : 'Controla saldos de clientes, vencimientos e historial de cobros.'}
          </p>
        </div>
        <button
          className="btn-primary operation-primary-action"
          onClick={() => abrirPago()}
          disabled={loading || !pendientes.length}
        >
          <Plus size={18} /> Registrar pago
        </button>
      </div>
      {success ? (
        <div className="notice-success" role="status">
          <WalletCards size={17} /> {success}
          <button type="button" onClick={() => setSuccess('')}>
            Cerrar
          </button>
        </div>
      ) : null}
      {error && !modal ? (
        <div className="notice-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="summary-row">
        <div className="summary-glass">
          <span>Saldo por {tipo}</span>
          <strong>S/ {saldoTotal.toFixed(2)}</strong>
        </div>
        <div className="summary-glass">
          <span>Saldo vencido</span>
          <strong>S/ {vencidoTotal.toFixed(2)}</strong>
        </div>
        <div className="summary-glass">
          <span>Próximos 7 días</span>
          <strong>{porVencer.length}</strong>
        </div>
        <div className="summary-glass">
          <span>{payable ? 'Pagado' : 'Cobrado'} este mes</span>
          <strong>S/ {paidThisMonth.toFixed(2)}</strong>
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
            <small>S/ {vencidoTotal.toFixed(2)} por regularizar</small>
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
          <option>Todas</option>
          <option value="POR_VENCER">POR VENCER</option>
          <option>VENCIDA</option>
          <option>PENDIENTE</option>
          <option>PARCIAL</option>
          <option>PAGADA</option>
          <option value="SIN_FECHA">SIN FECHA</option>
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
            ) : paginadas.length ? (
              paginadas.map((item) => {
                const due = dueMeta(item);
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.tercero}</strong>
                      <small>{item.documento}</small>
                    </td>
                    <td>{item.comprobante}</td>
                    <td>{formatDate(item.emision)}</td>
                    <td>{formatDate(item.vencimiento)}</td>
                    <td>
                      <span className={due.className}>{due.label}</span>
                      <small>{due.detail}</small>
                    </td>
                    <td>S/ {item.original.toFixed(2)}</td>
                    <td>S/ {item.pagado.toFixed(2)}</td>
                    <td>
                      <strong>S/ {item.saldo.toFixed(2)}</strong>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-soft"
                          onClick={() => abrirPago(item)}
                          title="Registrar pago"
                          aria-label={`Registrar pago de ${item.comprobante}`}
                          disabled={item.saldo <= 0}
                        >
                          <WalletCards size={16} />
                        </button>
                        <button
                          className="icon-soft"
                          title="Ver historial"
                          aria-label={`Ver historial de ${item.comprobante}`}
                          onClick={() => {
                            setCuentaId(item.id);
                            setError('');
                            setModal('historial');
                          }}
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9}>
                  <div className="table-empty">No hay cuentas que coincidan con los filtros.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={currentPage}
        pages={pages}
        total={visibles.length}
        pageSize={pageSize}
        onChange={setPagina}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPagina(1);
        }}
      />

      {modal === 'pago' && seleccionada ? (
        <div className="modal-backdrop">
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-modal-title"
          >
            <div className="modal-top">
              <div>
                <h2 id="payment-modal-title">Registrar pago por {tipo}</h2>
                <small>El abono actualizará automáticamente el saldo y estado de la cuenta.</small>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModal(null)}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={guardar}>
              <label className="field-wide">
                <span>Cuenta</span>
                <select
                  value={cuentaId}
                  onChange={(event) => seleccionarCuenta(event.target.value)}
                >
                  {cuentas
                    .filter((item) => item.saldo > 0)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.tercero} · {item.comprobante} · S/ {item.saldo.toFixed(2)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>Método de pago</span>
                <select
                  value={metodoId}
                  onChange={(event) => {
                    setMetodoId(event.target.value);
                    setNumeroOperacion('');
                  }}
                >
                  {metodos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Monto</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={seleccionada.saldo}
                  value={monto}
                  onChange={(event) => setMonto(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Número de operación</span>
                <input
                  value={numeroOperacion}
                  onChange={(event) => setNumeroOperacion(event.target.value)}
                  placeholder={metodoSeleccionado?.requiereOperacion ? 'Obligatorio' : 'Opcional'}
                  required={metodoSeleccionado?.requiereOperacion}
                />
              </label>
              <label>
                <span>Fecha</span>
                <input
                  type="date"
                  max={today()}
                  value={fechaPago}
                  onChange={(event) => setFechaPago(event.target.value)}
                  required
                />
              </label>
              <label className="field-wide">
                <span>Observaciones</span>
                <textarea
                  value={observaciones}
                  onChange={(event) => setObservaciones(event.target.value)}
                  placeholder="Detalle opcional del pago"
                />
              </label>
              <div className="payment-balance-preview field-wide">
                <span>
                  Saldo actual <strong>S/ {seleccionada.saldo.toFixed(2)}</strong>
                </span>
                <span>
                  Saldo después del pago{' '}
                  <strong>
                    S/ {Math.max(seleccionada.saldo - (Number(monto) || 0), 0).toFixed(2)}
                  </strong>
                </span>
              </div>
              {error ? (
                <div className="notice-error field-wide" role="alert">
                  {error}
                </div>
              ) : null}
              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setModal(null)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button className="btn-primary" disabled={saving}>
                  {saving ? 'Registrando...' : 'Registrar pago'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {modal === 'historial' && seleccionada ? (
        <div className="modal-backdrop">
          <section
            className="crud-modal account-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-modal-title"
          >
            <div className="modal-top">
              <div>
                <h2 id="history-modal-title">Historial de pagos</h2>
                <small>
                  {seleccionada.tercero} · {seleccionada.comprobante}
                </small>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setModal(null)}
                aria-label="Cerrar historial"
              >
                <X size={18} />
              </button>
            </div>
            <div className="account-history-body">
              <div className="payment-balance-preview">
                <span>
                  Monto original <strong>S/ {seleccionada.original.toFixed(2)}</strong>
                </span>
                <span>
                  Saldo pendiente <strong>S/ {seleccionada.saldo.toFixed(2)}</strong>
                </span>
              </div>
              {seleccionada.pagos.length ? (
                <div className="account-payment-list">
                  {seleccionada.pagos.map((payment) => (
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
                      <strong>S/ {payment.monto.toFixed(2)}</strong>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="table-empty">Todavía no se registraron pagos para esta cuenta.</div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
