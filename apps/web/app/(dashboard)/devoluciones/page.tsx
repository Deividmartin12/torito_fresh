'use client';

import { Eye, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { money } from '../../../lib/format';
import {
  createOperationalReturn,
  getOperationCatalogs,
  getOperationalReturns,
  getPurchases,
  getSales,
  OperationCatalogs,
  OperationalReturn,
  Purchase,
  ReturnsData,
  Sale,
  emptyCatalogs,
} from '../../../lib/operations';

type ReturnKind = 'VENTA' | 'COMPRA';
type Source = Sale | Purchase;
type LineDraft = {
  detalleId: string;
  cantidad: number;
  estadoDestinoId: string;
  reintegraInventario: boolean;
};
const emptyData: ReturnsData = { devoluciones: [], saldosFavor: [] };

export default function DevolucionesPage() {
  const [data, setData] = useState<ReturnsData>(emptyData);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [catalogs, setCatalogs] = useState<OperationCatalogs>(emptyCatalogs);
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState('TODAS');
  const [tab, setTab] = useState<'devoluciones' | 'saldos'>('devoluciones');
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState<OperationalReturn | null>(null);
  const [kind, setKind] = useState<ReturnKind>('VENTA');
  const [operationId, setOperationId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [returnsData, saleData, purchaseData, catalogData] = await Promise.all([
        getOperationalReturns(),
        getSales(),
        getPurchases(),
        getOperationCatalogs(),
      ]);
      setData(returnsData);
      setSales(saleData);
      setPurchases(purchaseData);
      setCatalogs(catalogData);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : 'No se pudieron cargar las devoluciones',
        { action: { label: 'Reintentar', onClick: () => void load() } },
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const sources = useMemo<Source[]>(
    () =>
      (kind === 'VENTA' ? sales : purchases).filter(
        (item) =>
          item.estado === 'CONFIRMADA' &&
          item.items.some((line) => line.cantidadDevuelta < line.cantidad),
      ),
    [kind, purchases, sales],
  );
  const source = sources.find((item) => item.id === operationId);
  const visible = data.devoluciones.filter(
    (item) =>
      (filterKind === 'TODAS' || item.tipo === filterKind) &&
      `${item.codigo} ${item.comprobante} ${item.tercero} ${item.motivo}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const availableState =
    catalogs.estadosInventario.find((item) => item.codigo === 'DISPONIBLE') ??
    catalogs.estadosInventario[0];

  function selectOperation(id: string, nextKind = kind) {
    setOperationId(id);
    const selected = (nextKind === 'VENTA' ? sales : purchases).find((item) => item.id === id);
    setLines(
      selected?.items.map((item) => ({
        detalleId: item.id,
        cantidad: 0,
        estadoDestinoId: availableState?.id ?? '',
        reintegraInventario: true,
      })) ?? [],
    );
  }
  function openCreate() {
    const initialKind: ReturnKind = sales.some((item) => item.estado === 'CONFIRMADA')
      ? 'VENTA'
      : 'COMPRA';
    setKind(initialKind);
    setReason('');
    setNotes('');
    setDetail(null);
    setModal(true);
    const first = (initialKind === 'VENTA' ? sales : purchases).find(
      (item) =>
        item.estado === 'CONFIRMADA' &&
        item.items.some((line) => line.cantidadDevuelta < line.cantidad),
    );
    selectOperation(first?.id ?? '', initialKind);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const selected = lines.filter((line) => line.cantidad > 0);
    if (!operationId || !reason.trim() || !selected.length) {
      toast.error('Selecciona la operación, indica el motivo y agrega al menos una cantidad.');
      return;
    }
    setSaving(true);
    try {
      await createOperationalReturn(kind.toLowerCase() as 'venta' | 'compra', {
        operacionId: Number(operationId),
        motivo: reason,
        observaciones: notes,
        items: selected.map((line) => ({
          detalleId: Number(line.detalleId),
          cantidad: line.cantidad,
          estadoDestinoId: line.estadoDestinoId ? Number(line.estadoDestinoId) : undefined,
          reintegraInventario: kind === 'VENTA' ? line.reintegraInventario : true,
        })),
      });
      setModal(false);
      toast.success(
        'Devolución confirmada. Se actualizaron el saldo y el inventario correspondiente.',
      );
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar la devolución');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="module-page operations-list-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Operaciones relacionadas</span>
          <h1>Devoluciones y saldos a favor</h1>
          <p>
            Cada devolución conserva la compra o venta original y registra sus efectos financieros y
            físicos.
          </p>
        </div>
        <button className="btn-primary operation-primary-action" onClick={openCreate}>
          <Plus size={18} /> Nueva devolución
        </button>
      </div>
      <div className="summary-row">
        <div className="summary-glass">
          <span>Devoluciones</span>
          <strong>{data.devoluciones.length}</strong>
        </div>
        <div className="summary-glass">
          <span>Importe devuelto</span>
          <strong>
            S/ {data.devoluciones.reduce((sum, item) => sum + item.total, 0).toFixed(2)}
          </strong>
        </div>
        <div className="summary-glass">
          <span>Saldos de clientes</span>
          <strong>
            S/{' '}
            {data.saldosFavor
              .filter((item) => item.tipo === 'CLIENTE')
              .reduce((sum, item) => sum + item.disponible, 0)
              .toFixed(2)}
          </strong>
        </div>
        <div className="summary-glass">
          <span>Saldos con proveedores</span>
          <strong>
            S/{' '}
            {data.saldosFavor
              .filter((item) => item.tipo === 'PROVEEDOR')
              .reduce((sum, item) => sum + item.disponible, 0)
              .toFixed(2)}
          </strong>
        </div>
      </div>
      <div className="return-tabs">
        <button
          className={tab === 'devoluciones' ? 'active' : ''}
          onClick={() => setTab('devoluciones')}
        >
          Devoluciones
        </button>
        <button className={tab === 'saldos' ? 'active' : ''} onClick={() => setTab('saldos')}>
          Saldos a favor
        </button>
      </div>
      {tab === 'devoluciones' ? (
        <>
          <div className="module-tools operations-filters">
            <label className="pill-search">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar devolución, comprobante o tercero"
              />
            </label>
            <select
              className="filter-pill"
              value={filterKind}
              onChange={(event) => setFilterKind(event.target.value)}
            >
              <option>TODAS</option>
              <option>VENTA</option>
              <option>COMPRA</option>
            </select>
          </div>
          {loading ? (
            <div className="table-loading">
              <span className="loading-spinner" /> Cargando devoluciones...
            </div>
          ) : (
            <div className="glass-table">
              <table>
                <thead>
                  <tr>
                    <th>Devolución</th>
                    <th>Origen 1:1</th>
                    <th>Cliente / proveedor</th>
                    <th>Motivo</th>
                    <th>Total</th>
                    <th>Efecto</th>
                    <th>Estado</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length ? (
                    visible.map((item) => (
                      <tr key={`${item.tipo}-${item.id}`}>
                        <td>
                          <strong>{item.codigo}</strong>
                          <small>{new Date(item.fecha).toLocaleString('es-PE')}</small>
                        </td>
                        <td>
                          <span className="status status-blue">{item.tipo}</span>
                          <small>{item.comprobante}</small>
                        </td>
                        <td>{item.tercero}</td>
                        <td>{item.motivo}</td>
                        <td>
                          <strong>{money(item.total)}</strong>
                        </td>
                        <td>
                          {item.saldoFavor > 0 ? (
                            <span className="status status-amber">
                              Saldo {money(item.saldoFavor)}
                            </span>
                          ) : item.kardexId ? (
                            <Link
                              className="kardex-link"
                              href={`/movimientos?ref=${encodeURIComponent(item.kardexRef ?? '')}`}
                            >
                              {item.kardexRef ?? 'Ver kardex'}
                            </Link>
                          ) : (
                            <small>Solo ajuste financiero</small>
                          )}
                        </td>
                        <td>
                          <span className="status status-green">{item.estado}</span>
                        </td>
                        <td>
                          <button
                            className="icon-soft"
                            onClick={() => setDetail(item)}
                            aria-label={`Ver ${item.codigo}`}
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8}>
                        <div className="table-empty">No hay devoluciones para estos filtros.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="glass-table">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Cliente / proveedor</th>
                <th>Generado</th>
                <th>Original</th>
                <th>Disponible</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.saldosFavor.length ? (
                data.saldosFavor.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="status status-blue">{item.tipo}</span>
                    </td>
                    <td>
                      <strong>{item.tercero}</strong>
                    </td>
                    <td>{new Date(item.fecha).toLocaleDateString('es-PE')}</td>
                    <td>S/ {item.original.toFixed(2)}</td>
                    <td>
                      <strong>S/ {item.disponible.toFixed(2)}</strong>
                    </td>
                    <td>
                      <span className="status status-green">{item.estado}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty">No existen saldos a favor pendientes.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal ? (
        <div className="modal-backdrop">
          <section
            className="crud-modal return-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-title"
          >
            <div className="modal-top">
              <div>
                <h2 id="return-title">Registrar devolución</h2>
                <small>
                  Solo puedes devolver productos y cantidades de la operación seleccionada.
                </small>
              </div>
              <button className="modal-close" onClick={() => setModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={submit}>
              <div className="operation-field-pair">
                <label>
                  <span>Origen</span>
                  <select
                    value={kind}
                    onChange={(event) => {
                      const next = event.target.value as ReturnKind;
                      setKind(next);
                      const first = (next === 'VENTA' ? sales : purchases).find(
                        (item) =>
                          item.estado === 'CONFIRMADA' &&
                          item.items.some((line) => line.cantidadDevuelta < line.cantidad),
                      );
                      selectOperation(first?.id ?? '', next);
                    }}
                  >
                    <option>VENTA</option>
                    <option>COMPRA</option>
                  </select>
                </label>
                <label>
                  <span>{kind === 'VENTA' ? 'Venta' : 'Compra'} original</span>
                  <select
                    value={operationId}
                    onChange={(event) => selectOperation(event.target.value)}
                    required
                  >
                    <option value="">Seleccionar operación</option>
                    {sources.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.codigo} ·{' '}
                        {'cliente' in item
                          ? item.cliente
                          : `${item.comprobante} · ${item.proveedor}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {source ? (
                <div className="return-source-summary">
                  <span>
                    Total original<strong>S/ {source.total.toFixed(2)}</strong>
                  </span>
                  <span>
                    Total neto actual<strong>S/ {source.totalNeto.toFixed(2)}</strong>
                  </span>
                  <span>
                    Pagado<strong>S/ {source.pagado.toFixed(2)}</strong>
                  </span>
                  <span>
                    Saldo<strong>S/ {source.saldo.toFixed(2)}</strong>
                  </span>
                </div>
              ) : null}
              <div className="return-lines">
                <div className="return-line-head">
                  <span>Producto</span>
                  <span>Disponible para devolver</span>
                  <span>Cantidad</span>
                  {kind === 'VENTA' ? <span>Destino físico</span> : null}
                </div>
                {source?.items.map((item, index) => {
                  const draft = lines[index];
                  const remaining = item.cantidad - item.cantidadDevuelta;
                  return (
                    <div className="return-line" key={item.id}>
                      <div>
                        <strong>{item.producto}</strong>
                        <small>
                          {item.cantidad} vendidos/comprados · {item.cantidadDevuelta} ya devueltos
                        </small>
                      </div>
                      <span>{remaining}</span>
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        step="1"
                        value={draft?.cantidad ?? 0}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((line, position) =>
                              position === index
                                ? { ...line, cantidad: Number(event.target.value) }
                                : line,
                            ),
                          )
                        }
                      />
                      {kind === 'VENTA' && draft ? (
                        <div className="return-destination">
                          <label className="check-field">
                            <input
                              type="checkbox"
                              checked={draft.reintegraInventario}
                              onChange={(event) =>
                                setLines((current) =>
                                  current.map((line, position) =>
                                    position === index
                                      ? { ...line, reintegraInventario: event.target.checked }
                                      : line,
                                  ),
                                )
                              }
                            />
                            <span>Regresa al stock</span>
                          </label>
                          {draft.reintegraInventario ? (
                            <select
                              value={draft.estadoDestinoId}
                              onChange={(event) =>
                                setLines((current) =>
                                  current.map((line, position) =>
                                    position === index
                                      ? { ...line, estadoDestinoId: event.target.value }
                                      : line,
                                  ),
                                )
                              }
                            >
                              {catalogs.estadosInventario.map((state) => (
                                <option key={state.id} value={state.id}>
                                  {state.nombre}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <small>Dañado, desechado o no recibido</small>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <label className="field-wide">
                <span>Motivo</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  placeholder="Explica por qué se realiza la devolución"
                />
              </label>
              <label className="field-wide">
                <span>Observaciones</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Información adicional opcional"
                />
              </label>
              <div className="modal-actions field-wide">
                <button className="btn-secondary" type="button" onClick={() => setModal(false)}>
                  Cancelar
                </button>
                <button className="btn-primary" disabled={saving}>
                  {saving ? 'Procesando...' : 'Confirmar devolución'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {detail ? (
        <div className="modal-backdrop">
          <section className="crud-modal">
            <div className="modal-top">
              <div>
                <h2>{detail.codigo}</h2>
                <small>
                  {detail.comprobante} · {detail.tercero}
                </small>
              </div>
              <button className="modal-close" onClick={() => setDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="operation-detail-items">
              {detail.items.map((item, index) => (
                <div className="detail-line" key={index}>
                  <span>
                    {item.producto}
                    <small>
                      {item.cantidad} · {item.destino}
                    </small>
                  </span>
                  <strong>S/ {item.importe.toFixed(2)}</strong>
                </div>
              ))}
            </div>
            <div className="review-total">
              <span>Total devuelto</span>
              <strong>S/ {detail.total.toFixed(2)}</strong>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setDetail(null)}>
                Cerrar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
