'use client';

import { Eye, Factory, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { fechaCorta } from '../../../lib/format';
import {
  createProductionOrder,
  getProductionCatalogs,
  getProductionOrders,
  ProductionCatalogs,
  ProductionOrder,
  updateProductionOrder,
} from '../../../lib/production';

const emptyCatalogs: ProductionCatalogs = { productosTerminados: [], insumos: [], almacenes: [] };
const today = () => new Date().toISOString().slice(0, 10);
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
  const [catalogs, setCatalogs] = useState(emptyCatalogs);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductionOrder | null>(null);
  const [detail, setDetail] = useState<ProductionOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [inputs, setInputs] = useState<{ productoId: string; cantidad: number }[]>([]);

  async function load() {
    const [catalogData, orderData] = await Promise.all([
      getProductionCatalogs(),
      getProductionOrders(),
    ]);
    setCatalogs(catalogData);
    setOrders(orderData);
    setForm((current) => ({
      ...current,
      productoId: current.productoId || catalogData.productosTerminados[0]?.id || '',
      almacenProductoTerminadoId:
        current.almacenProductoTerminadoId ||
        catalogData.almacenes.find((item) => item.tipo === 'PRODUCTO_TERMINADO')?.id ||
        catalogData.almacenes[0]?.id ||
        '',
    }));
  }
  useEffect(() => {
    void load()
      .catch((cause) =>
        toast.error(cause instanceof Error ? cause.message : 'No se pudo cargar producción'),
      )
      .finally(() => setLoading(false));
  }, []);

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
    setForm(emptyForm());
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
  function updateInput(index: number, patch: Partial<{ productoId: string; cantidad: number }>) {
    setInputs((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inputs.some((item) => !item.productoId || item.cantidad <= 0)) {
      toast.error('Completa o elimina los insumos agregados.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        almacenProductoTerminadoId: form.almacenProductoTerminadoId || undefined,
        cantidadPlanificada: Number(form.cantidadPlanificada),
        fechaPlanificada: form.fechaPlanificada,
        fechaVencimiento: form.fechaVencimiento || undefined,
        insumos: inputs,
      };
      const done = editing
        ? await updateProductionOrder(editing.id, payload)
        : await createProductionOrder({ ...payload, productoId: form.productoId });
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
          <p>Registra cuánto producto terminado se produce cada día.</p>
        </div>
        <button className="btn-primary operation-primary-action" onClick={openCreate}>
          <Plus size={17} /> Registrar producción
        </button>
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
      <div className="glass-table">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto terminado</th>
              <th>Cantidad producida</th>
              <th>Insumos</th>
              <th>Almacén destino</th>
              <th>Kardex</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visible.length ? (
              visible.map((item) => (
                <tr key={item.id}>
                  <td>{fechaCorta(item.fechaPlanificada)}</td>
                  <td>
                    <strong>{item.producto}</strong>
                    <small>{item.lote ? `Lote ${item.lote}` : 'Sin lote'}</small>
                  </td>
                  <td>{cantidad(item.cantidadProducida)} un.</td>
                  <td>
                    <strong>{item.insumos.length} insumos</strong>
                    <small>
                      {item.insumos.length
                        ? item.insumos.map((input) => input.producto).join(', ')
                        : 'No registrados'}
                    </small>
                  </td>
                  <td>{item.almacenProductoTerminado}</td>
                  <td>
                    {item.kardexId ? (
                      <Link
                        className="kardex-link"
                        href={`/movimientos?ref=${encodeURIComponent(item.kardexRef ?? '')}`}
                      >
                        {item.kardexRef ?? 'Ver kardex'}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-soft"
                        onClick={() => setDetail(item)}
                        title="Ver detalle"
                        aria-label={`Ver detalle de ${item.codigo}`}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-soft"
                        onClick={() => openEdit(item)}
                        title="Editar producción"
                        aria-label={`Editar ${item.codigo}`}
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="table-empty">No hay producciones registradas.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) closeForm();
          }}
        >
          <section
            className="crud-modal production-order-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Editar producción' : 'Registrar producción'}
          >
            <div className="modal-top">
              <div>
                <h2>
                  {editing ? `Editar producción ${editing.codigo}` : 'Registrar producción diaria'}
                </h2>
                <small>
                  {editing
                    ? 'Se revierte el movimiento de inventario anterior y se rehace con los datos nuevos. El producto terminado no cambia.'
                    : 'El código de orden, lote y almacén de origen se generan automáticamente.'}
                </small>
              </div>
              <button
                className="modal-close"
                onClick={closeForm}
                disabled={saving}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={(event) => void submit(event)}>
              <label>
                <span>Fecha de producción</span>
                <input
                  type="date"
                  max={today()}
                  value={form.fechaPlanificada}
                  onChange={(event) => setForm({ ...form, fechaPlanificada: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>Cantidad a producir</span>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.cantidadPlanificada}
                  onChange={(event) =>
                    setForm({ ...form, cantidadPlanificada: event.target.value })
                  }
                  required
                />
              </label>
              <label className="field-wide">
                <span>Producto terminado</span>
                {editing ? (
                  <input value={editing.producto} disabled readOnly />
                ) : (
                  <SearchableSelect
                    value={form.productoId}
                    onChange={(value) => setForm({ ...form, productoId: value })}
                    options={catalogs.productosTerminados.map((item) => ({
                      value: item.id,
                      label: `${item.codigo} · ${item.nombre}`,
                    }))}
                    placeholder="Seleccionar producto"
                    required
                  />
                )}
              </label>
              <label>
                <span>Almacén destino (opcional)</span>
                <select
                  value={form.almacenProductoTerminadoId}
                  onChange={(event) =>
                    setForm({ ...form, almacenProductoTerminadoId: event.target.value })
                  }
                >
                  <option value="">Automático</option>
                  {catalogs.almacenes.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.codigo} · {item.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Vencimiento (opcional)</span>
                <input
                  type="date"
                  value={form.fechaVencimiento}
                  onChange={(event) => setForm({ ...form, fechaVencimiento: event.target.value })}
                />
              </label>
              <details className="production-advanced field-wide">
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
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        setInputs((current) => [
                          ...current,
                          { productoId: '', cantidad: Number(form.cantidadPlanificada) || 0 },
                        ])
                      }
                    >
                      <Plus size={15} /> Agregar insumo
                    </button>
                  </div>
                  {inputs.map((item, index) => (
                    <div className="production-input-line" key={index}>
                      <label>
                        <span>Insumo</span>
                        <SearchableSelect
                          value={item.productoId}
                          onChange={(value) => updateInput(index, { productoId: value })}
                          options={catalogs.insumos.map((product) => ({
                            value: product.id,
                            label: `${product.codigo} · ${product.nombre}`,
                          }))}
                          placeholder="Seleccionar insumo"
                        />
                      </label>
                      <label>
                        <span>Cantidad</span>
                        <input
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
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button className="btn-primary" disabled={saving}>
                  <Factory size={16} />{' '}
                  {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar producción'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {detail ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetail(null);
          }}
        >
          <section
            className="crud-modal operation-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Detalle de producción ${detail.codigo}`}
          >
            <div className="modal-top">
              <div>
                <h2>Producción {detail.codigo}</h2>
                <small>Detalle de la producción y su efecto en inventario</small>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setDetail(null)}
                aria-label="Cerrar detalle"
              >
                <X size={18} />
              </button>
            </div>
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
                      detail.cantidadProducida > 0
                        ? detail.costoTotal / detail.cantidadProducida
                        : 0,
                    )}
                  </strong>
                </span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setDetail(null)}>
                  Cerrar
                </button>
                {detail.kardexId ? (
                  <Link
                    className="btn-secondary"
                    href={`/movimientos?ref=${encodeURIComponent(detail.kardexRef ?? '')}`}
                  >
                    Ver kardex
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    const order = detail;
                    setDetail(null);
                    openEdit(order);
                  }}
                >
                  <Pencil size={16} /> Editar
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
