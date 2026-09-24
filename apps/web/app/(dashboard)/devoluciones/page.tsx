'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { fechaCorta, fechaHora, moneda } from '../../../lib/format';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { NumericField } from '../../../components/operations/OperationForm';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { Segmented } from '../../../components/Segmented';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import {
  checkboxFieldClass,
  checkboxInputClass,
  fieldLabelClass,
  fieldWideClass,
  modalActionsClass,
  modalFormClass,
  textareaClass,
} from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { Modal, ModalHeader } from '../../../components/ui/Modal';
import {
  createOperationalReturn,
  getOperationCatalogs,
  getOperationalReturns,
  getSales,
  OperationalReturn,
  ReturnsData,
  Sale,
  emptyCatalogs,
} from '../../../lib/operations';

type LineDraft = {
  detalleId: string;
  cantidad: number;
  estadoDestinoId: string;
  reintegraInventario: boolean;
};
const emptyData: ReturnsData = { devoluciones: [], saldosFavor: [] };

export default function DevolucionesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'devoluciones' | 'saldos'>('devoluciones');
  // Comerciales (el cliente devolvió algo) vs anulaciones (la venta se dio de baja entera).
  const [clase, setClase] = useState<'comerciales' | 'anulaciones' | 'todas'>('comerciales');
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState<OperationalReturn | null>(null);
  const [operationId, setOperationId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const returnsQuery = useQuery({
    queryKey: ['operational-returns'],
    queryFn: getOperationalReturns,
  });
  const data = returnsQuery.data ?? emptyData;
  const salesQuery = useQuery({ queryKey: ['sales'], queryFn: () => getSales() });
  const sales = salesQuery.data ?? [];
  const catalogsQuery = useQuery({
    queryKey: ['operation-catalogs'],
    queryFn: getOperationCatalogs,
  });
  const catalogs = catalogsQuery.data ?? emptyCatalogs;
  const loading = returnsQuery.isPending || salesQuery.isPending || catalogsQuery.isPending;
  const load = useCallback(async () => {
    await Promise.all([returnsQuery.refetch(), salesQuery.refetch(), catalogsQuery.refetch()]);
  }, [returnsQuery, salesQuery, catalogsQuery]);
  useEffect(() => {
    const fallo = [returnsQuery, salesQuery, catalogsQuery].find((query) => query.error)?.error;
    if (fallo) {
      toast.error(
        fallo instanceof Error ? fallo.message : 'No se pudieron cargar las devoluciones',
        { action: { label: 'Reintentar', onClick: () => void load() } },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnsQuery.error, salesQuery.error, catalogsQuery.error]);

  const sources = useMemo<Sale[]>(
    () =>
      sales.filter(
        (item) =>
          item.estado === 'CONFIRMADA' &&
          item.items.some((line) => line.cantidadDevuelta < line.cantidad),
      ),
    [sales],
  );
  const source = sources.find((item) => item.id === operationId);
  const visible = data.devoluciones.filter(
    (item) =>
      // Una anulación de venta también es una devolución por dentro, pero no es lo mismo que
      // un cliente que devolvió mercadería: mezclarlas hace ilegible este listado.
      (clase === 'todas' || (clase === 'anulaciones' ? item.esAnulacion : !item.esAnulacion)) &&
      `${item.codigo} ${item.comprobante} ${item.tercero} ${item.motivo}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const availableState =
    catalogs.estadosInventario.find((item) => item.codigo === 'DISPONIBLE') ??
    catalogs.estadosInventario[0];
  // Si esta unidad lleva stock. Sale del catálogo, que es lo que el servidor va a hacer de
  // verdad, y no del selector del navegador (con "Todo consolidado" no coinciden).
  const controlaInventario = catalogs.unidadEscritura?.controlaInventario ?? true;

  function selectOperation(id: string) {
    setOperationId(id);
    const selected = sales.find((item) => item.id === id);
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
    setReason('');
    setNotes('');
    setDetail(null);
    setModal(true);
    const first = sales.find(
      (item) =>
        item.estado === 'CONFIRMADA' &&
        item.items.some((line) => line.cantidadDevuelta < line.cantidad),
    );
    selectOperation(first?.id ?? '');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const selected = lines.filter((line) => Number.isInteger(line.cantidad) && line.cantidad >= 1);
    if (!operationId || !reason.trim() || !selected.length) {
      toast.error('Selecciona la venta, indica el motivo y agrega al menos una cantidad.');
      return;
    }
    const source = sales.find((item) => item.id === operationId);
    const overLimit = selected.some((line) => {
      const detail = source?.items.find((item) => String(item.id) === String(line.detalleId));
      if (!detail) return true;
      return line.cantidad > detail.cantidad - detail.cantidadDevuelta;
    });
    if (overLimit) {
      toast.error('Una cantidad a devolver supera lo disponible de esa venta.');
      return;
    }
    setSaving(true);
    try {
      await createOperationalReturn({
        operacionId: Number(operationId),
        motivo: reason,
        observaciones: notes,
        items: selected.map((line) => ({
          detalleId: Number(line.detalleId),
          cantidad: line.cantidad,
          estadoDestinoId: line.estadoDestinoId ? Number(line.estadoDestinoId) : undefined,
          reintegraInventario: line.reintegraInventario,
        })),
      });
      setModal(false);
      toast.success(
        'Devolución confirmada. Se actualizaron el saldo y el inventario correspondiente.',
      );
      // Una devolución cambia las tres cosas a la vez: aparece en la lista, la venta original
      // queda con `cantidadDevuelta` al día, y puede tocar el stock del catálogo.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operational-returns'] }),
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['operation-catalogs'] }),
      ]);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar la devolución');
    } finally {
      setSaving(false);
    }
  }

  const returnColumns: DataTableColumn<OperationalReturn>[] = [
    {
      key: 'devolucion',
      header: 'Devolución',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.codigo}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">{fechaHora(item.fecha)}</small>
        </>
      ),
    },
    { key: 'venta', header: 'Venta original', render: (item) => item.comprobante },
    { key: 'cliente', header: 'Cliente', render: (item) => item.tercero },
    { key: 'motivo', header: 'Motivo', render: (item) => item.motivo },
    {
      key: 'total',
      header: 'Total',
      render: (item) => (
        <strong className="text-[13px] font-medium text-fg">{moneda(item.total)}</strong>
      ),
    },
    {
      key: 'efecto',
      header: 'Efecto',
      render: (item) =>
        item.saldoFavor > 0 ? (
          <Badge tone="amber">Saldo {moneda(item.saldoFavor)}</Badge>
        ) : item.kardexId ? (
          <Link
            className="kardex-link"
            href={`/movimientos?ref=${encodeURIComponent(item.kardexRef ?? '')}`}
          >
            {item.kardexRef ?? 'Ver kardex'}
          </Link>
        ) : (
          <small className="text-[11px] text-muted">Solo ajuste financiero</small>
        ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => <Badge tone="green">{item.estado}</Badge>,
    },
    {
      key: 'detalle',
      header: 'Detalle',
      cardLabel: null,
      render: (item) => (
        <IconButton onClick={() => setDetail(item)} aria-label={`Ver ${item.codigo}`}>
          <Eye size={16} />
        </IconButton>
      ),
    },
  ];

  const balanceColumns: DataTableColumn<ReturnsData['saldosFavor'][number]>[] = [
    {
      key: 'cliente',
      header: 'Cliente',
      cardLabel: null,
      render: (item) => (
        <strong className="block text-[13px] font-medium text-fg">{item.tercero}</strong>
      ),
    },
    { key: 'generado', header: 'Generado', render: (item) => fechaCorta(item.fecha) },
    { key: 'original', header: 'Original', render: (item) => `S/ ${item.original.toFixed(2)}` },
    {
      key: 'disponible',
      header: 'Disponible',
      render: (item) => (
        <strong className="text-[13px] font-medium text-fg">S/ {item.disponible.toFixed(2)}</strong>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => <Badge tone="green">{item.estado}</Badge>,
    },
  ];

  return (
    <div className="module-page operations-list-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Operaciones relacionadas</span>
          <h1>Devoluciones y saldos a favor</h1>
        </div>
        <Button className="min-h-[44px] shrink-0 px-[19px]" onClick={openCreate}>
          <Plus size={18} /> Nueva devolución
        </Button>
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
            S/ {data.saldosFavor.reduce((sum, item) => sum + item.disponible, 0).toFixed(2)}
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
                placeholder="Buscar devolución, comprobante o cliente"
              />
            </label>
            <Segmented
              value={clase}
              onChange={(value) => setClase(value as typeof clase)}
              options={[
                { value: 'comerciales', label: 'Comerciales' },
                { value: 'anulaciones', label: 'Anulaciones' },
                { value: 'todas', label: 'Todas' },
              ]}
              ariaLabel="Tipo de devolución"
            />
          </div>
          <DataTable
            columns={returnColumns}
            rows={visible}
            rowKey={(item) => item.id}
            loading={loading}
            loadingLabel="Cargando devoluciones..."
            emptyMessage={<span>No hay devoluciones para estos filtros.</span>}
          />
        </>
      ) : (
        <DataTable
          columns={balanceColumns}
          rows={data.saldosFavor}
          rowKey={(item) => item.id}
          loading={loading}
          loadingLabel="Cargando saldos a favor..."
          emptyMessage={<span>No existen saldos a favor pendientes.</span>}
        />
      )}

      {modal ? (
        <Modal onClose={() => setModal(false)} closeDisabled={saving} className="max-w-[940px]">
          <ModalHeader
            title="Registrar devolución"
            subtitle="Solo puedes devolver productos y cantidades de la venta seleccionada."
            onClose={() => setModal(false)}
          />
          <form className={modalFormClass} onSubmit={submit}>
            <label className={fieldWideClass}>
              <span className={fieldLabelClass}>Venta original</span>
              <SearchableSelect
                value={operationId}
                onChange={(value) => selectOperation(value)}
                options={sources.map((item) => ({
                  value: item.id,
                  label: `${item.codigo} · ${item.cliente}`,
                }))}
                placeholder="Buscar venta"
                required
              />
            </label>
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
                <span>Destino físico</span>
              </div>
              {source?.items.map((item, index) => {
                const draft = lines[index];
                const remaining = item.cantidad - item.cantidadDevuelta;
                return (
                  <div className="return-line" key={item.id}>
                    <div>
                      <strong>{item.producto}</strong>
                      <small>
                        {item.cantidad} vendidos · {item.cantidadDevuelta} ya devueltos
                      </small>
                    </div>
                    <span>
                      <span className="return-line-label">Disponible para devolver</span>
                      {remaining}
                    </span>
                    <label className="return-line-qty">
                      <span className="return-line-label">Cantidad</span>
                      <NumericField
                        value={draft?.cantidad ?? 0}
                        integer
                        onCommit={(cantidad) =>
                          setLines((current) =>
                            current.map((line, position) =>
                              position === index ? { ...line, cantidad } : line,
                            ),
                          )
                        }
                      />
                    </label>
                    {/* El destino físico solo existe si la unidad lleva stock. En un puesto que
                          solo registra ventas y gastos la devolución ajusta lo que el cliente
                          debe, y nada más: no hay inventario al que regresar. */}
                    {draft && controlaInventario ? (
                      <div className="return-destination">
                        <span className="return-line-label">Destino físico</span>
                        <label className={checkboxFieldClass}>
                          <input
                            className={checkboxInputClass}
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
                          <span className="text-[13px] font-medium">Regresa al stock</span>
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
            <label className={fieldWideClass}>
              <span className={fieldLabelClass}>Motivo</span>
              <textarea
                className={textareaClass}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                placeholder="Explica por qué se realiza la devolución"
              />
            </label>
            <label className={fieldWideClass}>
              <span className={fieldLabelClass}>Observaciones</span>
              <textarea
                className={textareaClass}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Información adicional opcional"
              />
            </label>
            <div className={`${modalActionsClass} ${fieldWideClass}`}>
              <Button variant="secondary" type="button" onClick={() => setModal(false)}>
                Cancelar
              </Button>
              <Button disabled={saving}>{saving ? 'Procesando...' : 'Confirmar devolución'}</Button>
            </div>
          </form>
        </Modal>
      ) : null}
      {detail ? (
        <Modal onClose={() => setDetail(null)}>
          <ModalHeader
            title={detail.codigo}
            subtitle={`${detail.comprobante} · ${detail.tercero}`}
            onClose={() => setDetail(null)}
          />
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
          <div className={modalActionsClass}>
            <Button variant="secondary" onClick={() => setDetail(null)}>
              Cerrar
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
