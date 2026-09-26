'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Eye, Factory, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlmacenCreado, AlmacenFormModal } from '../../../components/AlmacenFormModal';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { Button, buttonClass } from '../../../components/ui/Button';
import {
  controlClass,
  fieldLabelClass,
  fieldWideClass,
  modalActionsClass,
  modalFormClass,
} from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { Modal, ModalHeader } from '../../../components/ui/Modal';
import { fechaCorta } from '../../../lib/format';
import { etiquetaProducto } from '../../../lib/operations';
import {
  createProductionOrder,
  getProductionCatalogs,
  getProductionOrders,
  ProductionCatalogs,
  ProductionOrder,
  updateProductionOrder,
  UpdateProductionPayload,
} from '../../../lib/production';

const emptyCatalogs: ProductionCatalogs = { productosTerminados: [], insumos: [], almacenes: [] };
const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const cantidad = (value: number) =>
  new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(value);
const moneda = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const emptyForm = () => ({
  productoId: '',
  almacenProductoTerminadoId: '',
  cantidadPlanificada: '',
  fechaPlanificada: today(),
  fechaVencimiento: '',
});

export default function ProductionPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [almacenModal, setAlmacenModal] = useState(false);
  const [editing, setEditing] = useState<ProductionOrder | null>(null);
  const [detail, setDetail] = useState<ProductionOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [inputs, setInputs] = useState<{ productoId: string; cantidad: number }[]>([]);
  const cantidadInputRef = useRef<HTMLInputElement>(null);
  // El lote de esta producción ya se vendió/movió: solo se pueden corregir las fechas.
  const edicionLimitada = Boolean(editing?.loteMovido);

  const catalogsQuery = useQuery({
    queryKey: ['production-catalogs'],
    queryFn: getProductionCatalogs,
  });
  const catalogs = catalogsQuery.data ?? emptyCatalogs;
  const ordersQuery = useQuery({ queryKey: ['production-orders'], queryFn: getProductionOrders });
  const orders = ordersQuery.data ?? [];
  const loading = catalogsQuery.isPending || ordersQuery.isPending;
  const load = useCallback(
    () => Promise.all([catalogsQuery.refetch(), ordersQuery.refetch()]),
    [catalogsQuery, ordersQuery],
  );
  // Precarga el producto y el almacén por defecto del formulario apenas llega el catálogo.
  useEffect(() => {
    if (!catalogsQuery.data) return;
    setForm((current) => ({
      ...current,
      productoId: current.productoId || catalogsQuery.data.productosTerminados[0]?.id || '',
      almacenProductoTerminadoId:
        current.almacenProductoTerminadoId || catalogsQuery.data.almacenes[0]?.id || '',
    }));
  }, [catalogsQuery.data]);
  useEffect(() => {
    const fallo = catalogsQuery.error ?? ordersQuery.error;
    if (fallo) {
      toast.error(fallo instanceof Error ? fallo.message : 'No se pudo cargar producción');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogsQuery.error, ordersQuery.error]);

  const visible = useMemo(
    () =>
      orders.filter((item) =>
        `${item.producto} ${item.lote ?? ''}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [orders, search],
  );
  const producedUnits = orders.reduce((sum, item) => sum + item.cantidadProducida, 0);
  const totalCost = orders.reduce((sum, item) => sum + item.costoTotal, 0);
  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm(),
      productoId: catalogs.productosTerminados[0]?.id || '',
      almacenProductoTerminadoId: catalogs.almacenes[0]?.id || '',
    });
    setInputs([]);
    setFormOpen(true);
  }
  function openEdit(order: ProductionOrder) {
    setEditing(order);
    setForm({
      productoId: order.productoId,
      almacenProductoTerminadoId: order.almacenProductoTerminadoId,
      cantidadPlanificada: String(order.cantidadPlanificada),
      fechaPlanificada: order.fechaPlanificada.slice(0, 10),
      fechaVencimiento: order.fechaVencimiento ? order.fechaVencimiento.slice(0, 10) : '',
    });
    setInputs(
      order.insumos.map((input) => ({ productoId: input.productoId, cantidad: input.planificada })),
    );
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm());
    setInputs([]);
  }
  // Almacén creado desde el combo de producción: lo sumamos al catálogo y lo dejamos elegido.
  function handleAlmacenCreado(almacen: AlmacenCreado) {
    queryClient.setQueryData<ProductionCatalogs>(['production-catalogs'], (current) =>
      current
        ? {
            ...current,
            almacenes: [
              ...current.almacenes,
              { id: almacen.id, nombre: almacen.nombre, codigo: almacen.codigo },
            ].sort((a, b) => a.nombre.localeCompare(b.nombre)),
          }
        : current,
    );
    setForm((current) => ({ ...current, almacenProductoTerminadoId: almacen.id }));
    setAlmacenModal(false);
  }

  const columns: DataTableColumn<ProductionOrder>[] = [
    { key: 'fecha', header: 'Fecha', render: (item) => fechaCorta(item.fechaPlanificada) },
    {
      key: 'producto',
      header: 'Producto terminado',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.producto}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {item.lote ? `Lote ${item.lote}` : 'Sin lote'}
          </small>
        </>
      ),
    },
    {
      key: 'cantidad',
      header: 'Cantidad producida',
      render: (item) => `${cantidad(item.cantidadProducida)} un.`,
    },
    {
      key: 'insumos',
      header: 'Insumos',
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">
            {item.insumos.length} insumos
          </strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {item.insumos.length
              ? item.insumos.map((input) => input.producto).join(', ')
              : 'No registrados'}
          </small>
        </>
      ),
    },
    { key: 'almacen', header: 'Almacén destino', render: (item) => item.almacenProductoTerminado },
    {
      key: 'kardex',
      header: 'Kardex',
      render: (item) =>
        item.kardexId ? (
          <Link
            className="kardex-link"
            href={`/movimientos?ref=${encodeURIComponent(item.kardexRef ?? '')}`}
          >
            {item.kardexRef ?? 'Ver kardex'}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      cardLabel: null,
      render: (item) => (
        <div className="flex flex-wrap gap-[7px]">
          <IconButton
            onClick={() => setDetail(item)}
            title="Ver detalle"
            aria-label={`Ver detalle de ${item.codigo}`}
          >
            <Eye size={16} />
          </IconButton>
          <IconButton
            onClick={() => openEdit(item)}
            title="Editar producción"
            aria-label={`Editar ${item.codigo}`}
          >
            <Pencil size={16} />
          </IconButton>
        </div>
      ),
    },
  ];

  function updateInput(index: number, patch: Partial<{ productoId: string; cantidad: number }>) {
    setInputs((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.fechaPlanificada) {
      toast.error('Elige la fecha de producción.');
      return;
    }
    if (!editing && !form.productoId) {
      toast.error('Elige el producto terminado.');
      return;
    }
    const cantidadPlanificada = Number(form.cantidadPlanificada);
    if (!Number.isFinite(cantidadPlanificada) || cantidadPlanificada <= 0) {
      toast.error('Ingresa una cantidad a producir mayor que cero.');
      cantidadInputRef.current?.focus();
      return;
    }
    if (!edicionLimitada && inputs.some((item) => !item.productoId || item.cantidad <= 0)) {
      toast.error('Completa o elimina los insumos agregados.');
      return;
    }
    setSaving(true);
    try {
      // Con el lote ya movido solo se corrigen fechas: no se manda cantidad, almacén ni
      // insumos para no chocar con las validaciones del backend.
      const updatePayload: UpdateProductionPayload = edicionLimitada
        ? {
            cantidadPlanificada: editing!.cantidadPlanificada,
            fechaPlanificada: form.fechaPlanificada,
            fechaVencimiento: form.fechaVencimiento || undefined,
          }
        : {
            almacenProductoTerminadoId: form.almacenProductoTerminadoId || undefined,
            cantidadPlanificada,
            fechaPlanificada: form.fechaPlanificada,
            fechaVencimiento: form.fechaVencimiento || undefined,
            insumos: inputs,
          };
      const done = editing
        ? await updateProductionOrder(editing.id, updatePayload)
        : await createProductionOrder({
            productoId: form.productoId,
            almacenProductoTerminadoId: form.almacenProductoTerminadoId || undefined,
            cantidadPlanificada,
            fechaPlanificada: form.fechaPlanificada,
            fechaVencimiento: form.fechaVencimiento || undefined,
            insumos: inputs,
          });
      closeForm();
      toast.success(
        editing
          ? 'Producción actualizada.'
          : `Producción registrada${done.lote ? ` · Lote ${done.lote}` : ''}`,
      );
      await load();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : `No se pudo ${editing ? 'actualizar' : 'registrar'} la producción`,
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="operation-loading">
        <span className="loading-spinner" />
        <div>
          <strong>Cargando producción</strong>
          <small>Consultando registros y almacenes...</small>
        </div>
      </div>
    );
  return (
    <div className="module-page production-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Planta y envasado</span>
          <h1>Producción diaria</h1>
        </div>
        <Button className="min-h-[44px] shrink-0 px-[19px]" onClick={openCreate}>
          <Plus size={17} /> Registrar producción
        </Button>
      </div>
      <div className="summary-row">
        <div className="summary-glass">
          <span>Órdenes registradas</span>
          <strong>{orders.length}</strong>
        </div>
        <div className="summary-glass">
          <span>Producido</span>
          <strong>{cantidad(producedUnits)}</strong>
          <small>Unidades terminadas</small>
        </div>
        <div className="summary-glass">
          <span>Costo producido</span>
          <strong>{moneda(totalCost)}</strong>
          <small>Consumo valorizado</small>
        </div>
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar producción o producto"
          />
        </label>
      </div>
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(item) => item.id}
        emptyMessage={<span>No hay producciones registradas.</span>}
      />

      {formOpen ? (
        <Modal
          onClose={closeForm}
          closeDisabled={saving}
          className="max-w-[880px] animate-[overlay-panel-in_200ms_ease-out]"
        >
          <ModalHeader
            title={editing ? `Editar producción ${editing.codigo}` : 'Registrar producción diaria'}
            subtitle={
              editing
                ? edicionLimitada
                  ? 'Este lote ya tiene ventas o movimientos de inventario. Solo puedes corregir la fecha de producción y el vencimiento.'
                  : 'Se revierte el movimiento de inventario anterior y se rehace con los datos nuevos. El producto terminado no cambia.'
                : 'El código de orden, lote y almacén de origen se generan automáticamente.'
            }
            onClose={closeForm}
            closeDisabled={saving}
          />
          <form className={modalFormClass} noValidate onSubmit={(event) => void submit(event)}>
            {edicionLimitada ? (
              <div className={`operation-warning ${fieldWideClass}`}>
                <AlertCircle size={18} />
                <div>
                  <strong>Edición limitada</strong>
                  <span>
                    Este lote ya tiene ventas o movimientos de inventario. Solo puedes ajustar la
                    fecha de producción y el vencimiento; la cantidad, el almacén y los insumos
                    quedan bloqueados.
                  </span>
                </div>
              </div>
            ) : null}
            <label>
              <span className={fieldLabelClass}>Fecha de producción</span>
              <input
                className={controlClass}
                type="date"
                max={today()}
                value={form.fechaPlanificada}
                onChange={(event) => setForm({ ...form, fechaPlanificada: event.target.value })}
                required
              />
            </label>
            <label>
              <span className={fieldLabelClass}>Cantidad a producir</span>
              <input
                ref={cantidadInputRef}
                className={controlClass}
                type="number"
                min="0.001"
                step="0.001"
                value={form.cantidadPlanificada}
                onChange={(event) => setForm({ ...form, cantidadPlanificada: event.target.value })}
                disabled={edicionLimitada}
                required
              />
            </label>
            <label className={fieldWideClass}>
              <span className={fieldLabelClass}>Producto terminado</span>
              {editing ? (
                <input className={controlClass} value={editing.producto} disabled readOnly />
              ) : (
                <SearchableSelect
                  value={form.productoId}
                  onChange={(value) => setForm({ ...form, productoId: value })}
                  options={catalogs.productosTerminados.map((item) => ({
                    value: item.id,
                    label: etiquetaProducto(item),
                  }))}
                  placeholder="Seleccionar producto"
                  required
                />
              )}
            </label>
            <label>
              <span className={fieldLabelClass}>Almacén destino (opcional)</span>
              <SearchableSelect
                value={form.almacenProductoTerminadoId}
                onChange={(value) => setForm({ ...form, almacenProductoTerminadoId: value })}
                options={catalogs.almacenes.map((item) => ({
                  value: item.id,
                  label: item.codigo ? `${item.codigo} · ${item.nombre}` : item.nombre,
                }))}
                placeholder="Automático"
                actionLabel="+ Agregar almacén"
                onAction={() => setAlmacenModal(true)}
                disabled={edicionLimitada}
              />
            </label>
            <label>
              <span className={fieldLabelClass}>Vencimiento (opcional)</span>
              <input
                className={controlClass}
                type="date"
                value={form.fechaVencimiento}
                onChange={(event) => setForm({ ...form, fechaVencimiento: event.target.value })}
              />
            </label>
            {edicionLimitada ? (
              <div className={`production-advanced ${fieldWideClass}`}>
                <p>
                  Insumos registrados:{' '}
                  {editing?.insumos.length
                    ? editing.insumos.map((input) => input.producto).join(', ')
                    : 'ninguno'}{' '}
                  (no editables).
                </p>
              </div>
            ) : (
              <details className={`production-advanced ${fieldWideClass}`}>
                <summary>Opciones avanzadas: materia prima e insumos</summary>
                <p>
                  Úsalas solo si deseas descontar y valorizar la materia prima usada. Si no agregas
                  insumos, se registra únicamente la producción diaria.
                </p>
                <div className="production-inputs">
                  <div className="lines-head">
                    <div>
                      <strong>Materia prima y envases</strong>
                      <small>Se tomarán del almacén de origen automático.</small>
                    </div>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() =>
                        setInputs((current) => [
                          ...current,
                          { productoId: '', cantidad: Number(form.cantidadPlanificada) || 0 },
                        ])
                      }
                    >
                      <Plus size={15} /> Agregar insumo
                    </Button>
                  </div>
                  {inputs.map((item, index) => (
                    <div className="production-input-line" key={index}>
                      <label>
                        <span className={fieldLabelClass}>Insumo</span>
                        <SearchableSelect
                          value={item.productoId}
                          onChange={(value) => updateInput(index, { productoId: value })}
                          options={catalogs.insumos.map((product) => ({
                            value: product.id,
                            label: etiquetaProducto(product),
                          }))}
                          placeholder="Seleccionar insumo"
                        />
                      </label>
                      <label>
                        <span className={fieldLabelClass}>Cantidad</span>
                        <input
                          className={controlClass}
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={item.cantidad}
                          onChange={(event) =>
                            updateInput(index, { cantidad: Number(event.target.value) })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="line-remove"
                        onClick={() =>
                          setInputs((current) =>
                            current.filter((_, position) => position !== index),
                          )
                        }
                        aria-label="Quitar insumo"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <div className={modalActionsClass}>
              <Button variant="secondary" type="button" onClick={closeForm} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                <Factory size={16} />{' '}
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar producción'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {almacenModal ? (
        <AlmacenFormModal onClose={() => setAlmacenModal(false)} onSaved={handleAlmacenCreado} />
      ) : null}

      {detail ? (
        <Modal
          onClose={() => setDetail(null)}
          className="max-w-[880px] animate-[overlay-panel-in_200ms_ease-out]"
        >
          <ModalHeader
            title={`Producción ${detail.codigo}`}
            subtitle="Detalle de la producción y su efecto en inventario"
            onClose={() => setDetail(null)}
            closeLabel="Cerrar detalle"
          />
          <div className="operation-detail">
            <div className="detail-summary">
              <span>
                Producto<strong>{detail.producto}</strong>
              </span>
              <span>
                Lote<strong>{detail.lote ?? 'Sin lote'}</strong>
              </span>
              <span>
                Fecha de producción<strong>{fechaCorta(detail.fechaPlanificada)}</strong>
              </span>
              <span>
                Vencimiento
                <strong>
                  {detail.fechaVencimiento ? fechaCorta(detail.fechaVencimiento) : 'Sin fecha'}
                </strong>
              </span>
              <span>
                Cantidad producida<strong>{cantidad(detail.cantidadProducida)} un.</strong>
              </span>
              <span>
                Almacén destino<strong>{detail.almacenProductoTerminado}</strong>
              </span>
              <span>
                Almacén de insumos<strong>{detail.almacenInsumos}</strong>
              </span>
              <span>
                Responsable<strong>{detail.responsable}</strong>
              </span>
            </div>
            <div className="operation-detail-items">
              {detail.insumos.length ? (
                detail.insumos.map((input, index) => (
                  <div className="detail-line" key={`${input.productoId}-${index}`}>
                    <span>
                      {input.producto}
                      <small>
                        Planificado: {cantidad(input.planificada)} · Consumido:{' '}
                        {cantidad(input.consumida)}
                      </small>
                    </span>
                  </div>
                ))
              ) : (
                <div className="detail-line">
                  <span>Sin insumos registrados</span>
                </div>
              )}
            </div>
            <div className="operation-financial-summary">
              <span>
                Costo total<strong>{moneda(detail.costoTotal)}</strong>
              </span>
              <span>
                Costo unitario
                <strong>
                  {moneda(
                    detail.cantidadProducida > 0 ? detail.costoTotal / detail.cantidadProducida : 0,
                  )}
                </strong>
              </span>
            </div>
            <div className={modalActionsClass}>
              <Button variant="secondary" type="button" onClick={() => setDetail(null)}>
                Cerrar
              </Button>
              {detail.kardexId ? (
                <Link
                  className={buttonClass('secondary')}
                  href={`/movimientos?ref=${encodeURIComponent(detail.kardexRef ?? '')}`}
                >
                  Ver kardex
                </Link>
              ) : null}
              <Button
                type="button"
                onClick={() => {
                  const order = detail;
                  setDetail(null);
                  openEdit(order);
                }}
              >
                <Pencil size={16} /> Editar
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
