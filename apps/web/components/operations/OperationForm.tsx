'use client';

import {
  AlertCircle,
  CalendarClock,
  Check,
  PiggyBank,
  Plus,
  ReceiptText,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Cliente } from '../../lib/clients';
import { formaPagoLabel, formaPagoOpciones, resumenVencimiento } from '../../lib/credit';
import { moneda } from '../../lib/format';
import {
  createSale,
  emptyCatalogs,
  emptyLine,
  getOperationCatalogs,
  getOperationStock,
  getOperationalPaymentMethods,
  getSale,
  OperationLine,
  OperationalPaymentMethod,
  PaymentType,
  Sale,
  StockRow,
  updateSale,
} from '../../lib/operations';
import { ClienteFormModal } from '../ClienteFormModal';
import { SearchableSelect } from '../SearchableSelect';

type FieldErrors = Partial<Record<'entity' | 'items' | 'payment' | 'dueDate', string>>;

const iconoFormaPago = { CONTADO: Wallet, CREDITO: CalendarClock, MIXTO: PiggyBank } as const;

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const localTodayPlus = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/** Formulario de venta. Con `saleId` precarga una venta existente y edita en vez de crear. */
export function OperationForm({ saleId }: { saleId?: string } = {}) {
  const editing = Boolean(saleId);
  const router = useRouter();
  const [catalogs, setCatalogs] = useState(emptyCatalogs);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [entityId, setEntityId] = useState('');
  const [clienteModal, setClienteModal] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('CONTADO');
  const [paymentMethods, setPaymentMethods] = useState<OperationalPaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [initialAmount, setInitialAmount] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OperationLine[]>([emptyLine()]);
  // Solo al editar: la venta tal como estaba guardada. Sirve para calcular bien el stock
  // disponible, porque lo que esta venta ya descontó vuelve al almacén al guardar los cambios.
  const [ventaOriginal, setVentaOriginal] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    Promise.all([getOperationCatalogs(), getOperationStock(), getOperationalPaymentMethods()])
      .then(async ([catalogData, stockData, methods]) => {
        setCatalogs(catalogData);
        setStock(stockData);
        setPaymentMethods(methods);
        if (saleId) {
          const sale = await getSale(saleId);
          setEntityId(sale.clienteId);
          setWarehouseId(sale.almacenId);
          setPaymentType(sale.pago as PaymentType);
          setNotes(sale.observaciones ?? '');
          // Se precarga TODO lo de la venta (incluidos crédito y descuentos). Si no, al
          // guardar se perdía el descuento —y el total subía solo— y una venta a crédito
          // pedía una fecha de vencimiento nueva cada vez que se editaba.
          setInitialAmount(sale.montoInicial);
          setDueDate(sale.fechaVencimiento ? sale.fechaVencimiento.slice(0, 10) : '');
          setPaymentMethodId(methods.find((method) => !method.requiereOperacion)?.id ?? '');
          setItems(
            sale.items.map((item) => ({
              productoId: item.productoId,
              cantidad: item.cantidad,
              precioUnitario: item.precio,
              descuento: item.descuento,
            })),
          );
          setVentaOriginal(sale);
        } else {
          setPaymentMethodId(methods.find((method) => !method.requiereOperacion)?.id ?? '');
          setWarehouseId(catalogData.almacenes[0]?.id ?? '');
        }
      })
      .catch((cause) =>
        toast.error(
          cause instanceof Error
            ? cause.message
            : 'No se pudieron cargar los datos de la operación',
        ),
      )
      .finally(() => setLoading(false));
  }, [saleId]);

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Math.max(item.cantidad * item.precioUnitario - item.descuento, 0),
        0,
      ),
    [items],
  );
  const total = subtotal;
  const selectedClient = catalogs.clientes.find((item) => item.id === entityId);
  const creditAmount = paymentType === 'MIXTO' ? Math.max(total - initialAmount, 0) : total;

  // Cliente creado desde el formulario de venta: lo agregamos al catálogo y lo dejamos elegido.
  function handleClienteCreado(cliente: Cliente) {
    setCatalogs((current) => ({
      ...current,
      clientes: [
        {
          id: cliente.id,
          nombre: cliente.name,
          documento: cliente.document ?? undefined,
          deudaActual: 0,
          comprobantesPendientes: 0,
        },
        ...current.clientes,
      ],
    }));
    setEntityId(cliente.id);
    setFieldErrors((current) => ({ ...current, entity: undefined }));
    setClienteModal(false);
  }

  useEffect(() => {
    if (!reviewOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setReviewOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [reviewOpen, saving]);

  function updateLine(index: number, patch: Partial<OperationLine>) {
    setItems((current) =>
      current.map((line, position) => (position === index ? { ...line, ...patch } : line)),
    );
    setFieldErrors((current) => ({ ...current, items: undefined }));
  }
  function selectProduct(index: number, productoId: string) {
    const product = catalogs.productos.find((item) => item.id === productoId);
    updateLine(index, { productoId, precioUnitario: product?.precioVenta ?? 0 });
  }
  /**
   * Stock disponible por producto en el almacén elegido, calculado UNA vez (antes se recorría
   * toda la lista de stock dos veces por línea en cada tecla que escribías).
   *
   * Al editar se suma de vuelta lo que esta misma venta ya tenía descontado: si no, el
   * formulario creía que no había stock y no dejaba guardar, aunque el servidor sí puede
   * (primero revierte la salida vieja y después aplica la nueva).
   */
  const disponiblePorProducto = useMemo(() => {
    const almacen = catalogs.almacenes.find((item) => item.id === warehouseId);
    const porCodigo = new Map<string, number>();
    for (const fila of stock) {
      if (!fila.vendible || fila.almacen !== almacen?.nombre) continue;
      const libre = Math.max(fila.cantidad - fila.reservada, 0);
      porCodigo.set(fila.codigo, (porCodigo.get(fila.codigo) ?? 0) + libre);
    }

    const porProducto = new Map<string, number>();
    for (const producto of catalogs.productos) {
      porProducto.set(producto.id, porCodigo.get(producto.codigo ?? '') ?? 0);
    }
    for (const linea of ventaOriginal?.items ?? []) {
      porProducto.set(linea.productoId, (porProducto.get(linea.productoId) ?? 0) + linea.cantidad);
    }
    return porProducto;
  }, [catalogs.almacenes, catalogs.productos, stock, warehouseId, ventaOriginal]);

  function available(productoId: string) {
    if (!productoId) return 0;
    return disponiblePorProducto.get(productoId) ?? 0;
  }
  function validate() {
    const next: FieldErrors = {};
    if (!entityId) next.entity = 'Selecciona un cliente.';
    if (paymentType === 'MIXTO' && (initialAmount <= 0 || initialAmount >= total))
      next.payment = 'En pago mixto, el abono inicial debe ser mayor a cero y menor que el total.';
    if ((paymentType === 'CONTADO' || paymentType === 'MIXTO') && !paymentMethodId)
      next.payment = 'Selecciona cómo se realizó el pago inicial.';
    if (paymentType !== 'CONTADO' && !dueDate)
      next.dueDate = 'Selecciona cuándo vence el saldo pendiente.';
    else if (dueDate && dueDate < localToday())
      next.dueDate = 'La fecha de vencimiento no puede estar en el pasado.';
    if (
      items.some(
        (item) => !item.productoId || !Number.isInteger(item.cantidad) || item.cantidad <= 0,
      )
    )
      next.items = 'Selecciona cada producto e ingresa una cantidad entera mayor a cero.';
    else if (items.some((item) => item.cantidad > available(item.productoId)))
      next.items = 'Una cantidad supera el stock disponible del almacén seleccionado.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }
  function openReview() {
    if (validate()) setReviewOpen(true);
  }
  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        clienteId: entityId,
        almacenId: warehouseId || undefined,
        tipoPago: paymentType,
        observaciones: notes,
        items,
        metodoPagoId: paymentMethodId || undefined,
        montoInicial:
          paymentType === 'CONTADO' ? total : paymentType === 'MIXTO' ? initialAmount : 0,
        fechaVencimiento: paymentType === 'CONTADO' ? undefined : dueDate || undefined,
      };
      if (editing && saleId) await updateSale(saleId, payload);
      else await createSale(payload);
      toast.success(editing ? 'Venta actualizada' : 'Venta registrada');
      router.push('/ventas');
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar la venta');
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="operation-loading" role="status">
        <span className="loading-spinner" />
        <div>
          <strong>Cargando datos</strong>
          <small>Preparando catalogos e inventario...</small>
        </div>
      </div>
    );

  return (
    <form
      className="operation-form operation-form-sections"
      onSubmit={(event) => {
        event.preventDefault();
        openReview();
      }}
      noValidate
    >
      {!catalogs.preparado ? (
        <div className="operation-warning">
          <AlertCircle size={18} />
          <div>
            <strong>Configuración incompleta</strong>
            <span>
              Se necesita al menos un trabajador, almacen y producto activo para registrar
              operaciones.
            </span>
          </div>
        </div>
      ) : null}

      <div className="operation-workspace">
        <section
          className="operation-section operation-products-section"
          aria-labelledby="sale-items-title"
        >
          <div className="operation-section-head">
            <span>1</span>
            <div>
              <h2 id="sale-items-title">Productos vendidos</h2>
              <p>Busca productos y registra las cantidades. El stock se valida según el almacén.</p>
            </div>
            <button
              type="button"
              className="btn-secondary operation-add-line"
              onClick={() => setItems((current) => [...current, emptyLine()])}
            >
              <Plus size={16} /> Agregar producto
            </button>
          </div>
          <div className="operation-line-head" aria-hidden="true">
            <span>Producto</span>
            <span>Cantidad</span>
            <span>Precio unitario</span>
            <span>Importe</span>
            <span />
          </div>
          <div className="lines-editor operation-lines">
            {items.map((item, index) => (
              <div className="product-line" key={index}>
                <label className="line-product">
                  <span>Producto</span>
                  <SearchableSelect
                    value={item.productoId}
                    onChange={(value) => selectProduct(index, value)}
                    options={catalogs.productos.map((product) => ({
                      value: product.id,
                      label: `${product.codigo ?? ''} · ${product.nombre}`,
                      hint: `Disponible: ${available(product.id)}`,
                    }))}
                    placeholder="Buscar por código o nombre"
                    required
                  />
                  {item.productoId && available(item.productoId) < item.cantidad ? (
                    <small className="stock-warning">
                      Solo hay <b>{available(item.productoId)}</b> disponibles en este almacén.
                    </small>
                  ) : null}
                </label>
                <label>
                  <span>Cantidad</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={item.cantidad}
                    onKeyDown={(event) => {
                      if (['.', ',', 'e', 'E', '+', '-'].includes(event.key))
                        event.preventDefault();
                    }}
                    onChange={(event) =>
                      updateLine(index, { cantidad: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  <span>Precio unitario</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.precioUnitario}
                    onChange={(event) =>
                      updateLine(index, { precioUnitario: Number(event.target.value) })
                    }
                  />
                </label>
                <strong className="line-total">
                  <small>Importe</small>S/{' '}
                  {Math.max(item.cantidad * item.precioUnitario - item.descuento, 0).toFixed(2)}
                </strong>
                <button
                  type="button"
                  className="line-remove"
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((current) => current.filter((_, position) => position !== index))
                  }
                  aria-label={`Quitar producto ${index + 1}`}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
          {fieldErrors.items ? (
            <p className="field-error operation-lines-error">{fieldErrors.items}</p>
          ) : null}
        </section>

        <aside
          className="operation-section operation-general-section"
          aria-labelledby="sale-general-title"
        >
          <div className="operation-section-head">
            <span>2</span>
            <div>
              <h2 id="sale-general-title">Datos generales</h2>
              <p>Información de la operación.</p>
            </div>
          </div>
          <div className="step-fields operation-fields">
            <label>
              <span>Cliente</span>
              <SearchableSelect
                value={entityId}
                onChange={(value) => {
                  setEntityId(value);
                  setFieldErrors((current) => ({ ...current, entity: undefined }));
                }}
                options={catalogs.clientes.map((item) => ({
                  value: item.id,
                  label: item.documento ? `${item.nombre} · ${item.documento}` : item.nombre,
                }))}
                placeholder="Buscar cliente"
                required
                actionLabel="+ Agregar cliente"
                onAction={() => setClienteModal(true)}
              />
              {fieldErrors.entity ? (
                <small className="field-error">{fieldErrors.entity}</small>
              ) : selectedClient && (selectedClient.deudaActual ?? 0) > 0 ? (
                <small className="client-debt-hint">
                  Deuda actual: {moneda(selectedClient.deudaActual)} ·{' '}
                  {selectedClient.comprobantesPendientes}{' '}
                  {selectedClient.comprobantesPendientes === 1 ? 'comprobante' : 'comprobantes'}
                </small>
              ) : null}
            </label>

            <div className="payment-type-field">
              <span className="label">Forma de pago</span>
              <div className="payment-type-options" role="radiogroup" aria-label="Forma de pago">
                {formaPagoOpciones.map((option) => {
                  const Icono = iconoFormaPago[option.value];
                  return (
                    <button
                      type="button"
                      key={option.value}
                      role="radio"
                      aria-checked={paymentType === option.value}
                      className={paymentType === option.value ? 'active' : ''}
                      onClick={() => {
                        setPaymentType(option.value);
                        setFieldErrors((current) => ({
                          ...current,
                          payment: undefined,
                          dueDate: undefined,
                        }));
                      }}
                    >
                      <Icono size={20} aria-hidden="true" />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {paymentType !== 'CREDITO' ? (
              <div className="operation-field-pair">
                <label>
                  <span>
                    {paymentType === 'MIXTO' ? 'Método del abono inicial' : 'Método de pago'}
                  </span>
                  <select
                    value={paymentMethodId}
                    onChange={(event) => {
                      setPaymentMethodId(event.target.value);
                      setFieldErrors((current) => ({ ...current, payment: undefined }));
                    }}
                  >
                    <option value="">Seleccionar</option>
                    {paymentMethods
                      .filter((method) => !method.requiereOperacion)
                      .map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.nombre}
                        </option>
                      ))}
                  </select>
                </label>
                {paymentType === 'CONTADO' ? (
                  <label>
                    <span>Monto que paga</span>
                    <input value={moneda(total)} readOnly />
                  </label>
                ) : (
                  <label>
                    <span>Abono inicial</span>
                    <input
                      type="number"
                      min="0.01"
                      max={Math.max(total - 0.01, 0)}
                      step="0.01"
                      value={initialAmount}
                      onChange={(event) => {
                        setInitialAmount(Number(event.target.value));
                        setFieldErrors((current) => ({ ...current, payment: undefined }));
                      }}
                    />
                  </label>
                )}
              </div>
            ) : null}

            {paymentType !== 'CONTADO' ? (
              <div className="credit-panel">
                <div className="credit-panel-head">
                  <strong>Esta venta queda a crédito</strong>
                  <span>
                    Quedará pendiente <b>{moneda(creditAmount)}</b>
                  </span>
                </div>
                <label>
                  <span>¿Cuándo pagará el cliente?</span>
                  <input
                    type="date"
                    min={localToday()}
                    value={dueDate}
                    onChange={(event) => {
                      setDueDate(event.target.value);
                      setFieldErrors((current) => ({ ...current, dueDate: undefined }));
                    }}
                    required
                  />
                  <div className="credit-date-presets">
                    {[7, 15, 30].map((days) => (
                      <button
                        type="button"
                        key={days}
                        className={dueDate === localTodayPlus(days) ? 'active' : ''}
                        onClick={() => {
                          setDueDate(localTodayPlus(days));
                          setFieldErrors((current) => ({ ...current, dueDate: undefined }));
                        }}
                      >
                        {days} días
                      </button>
                    ))}
                  </div>
                </label>
                {dueDate && !fieldErrors.dueDate ? (
                  <small className="credit-due-hint">
                    {resumenVencimiento(dueDate, creditAmount).label}
                  </small>
                ) : null}
                {fieldErrors.dueDate ? (
                  <small className="field-error">{fieldErrors.dueDate}</small>
                ) : null}
              </div>
            ) : null}
            {fieldErrors.payment ? <p className="field-error">{fieldErrors.payment}</p> : null}
            <label className="review-notes">
              <span>Observaciones</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Nota opcional para esta operación"
              />
            </label>
          </div>
        </aside>
      </div>

      <div className="operation-sticky-actions">
        <Link href="/ventas" className="btn-secondary">
          Cancelar
        </Link>
        <div className="operation-running-total">
          <span>Total estimado</span>
          <strong>S/ {total.toFixed(2)}</strong>
        </div>
        <button type="submit" className="btn-primary" disabled={saving || !catalogs.preparado}>
          <ReceiptText size={17} /> Revisar y continuar
        </button>
      </div>

      {reviewOpen ? (
        <div
          className="operation-review-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setReviewOpen(false);
          }}
        >
          <section
            className="operation-review-modal sale-receipt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-review-title"
          >
            <div className="sale-receipt-head">
              <div>
                <strong id="sale-review-title">AGUA TORITO FRESH</strong>
                <span>Boleta de venta (vista previa)</span>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setReviewOpen(false)}
                disabled={saving}
                aria-label="Cerrar resumen"
              >
                <X size={20} />
              </button>
            </div>
            <div className="operation-review-scroll">
              <div className="sale-receipt-meta">
                <div>
                  <small>N.° de venta</small>
                  {editing ? (
                    <span>Sin cambios de código</span>
                  ) : (
                    <span>Se genera al confirmar</span>
                  )}
                </div>
                <div>
                  <small>Fecha</small>
                  <span>{new Date().toLocaleDateString('es-PE')}</span>
                </div>
                <div>
                  <small>Cliente</small>
                  <span>{selectedClient?.nombre ?? 'Sin seleccionar'}</span>
                </div>
                <div>
                  <small>Forma de pago</small>
                  <span>
                    {formaPagoLabel[paymentType] ?? paymentType}
                    {paymentType !== 'CONTADO' && dueDate
                      ? ` · ${moneda(creditAmount)} a crédito`
                      : ''}
                  </span>
                </div>
              </div>
              <table className="sale-receipt-items">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cant.</th>
                    <th>P. unit.</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={`${item.productoId}-${index}`}>
                      <td>
                        {catalogs.productos.find((product) => product.id === item.productoId)
                          ?.nombre ?? 'Producto'}
                      </td>
                      <td>{item.cantidad}</td>
                      <td>S/ {item.precioUnitario.toFixed(2)}</td>
                      <td>
                        S/{' '}
                        {Math.max(item.cantidad * item.precioUnitario - item.descuento, 0).toFixed(
                          2,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {notes ? (
                <div className="operation-review-note">
                  <small>Observaciones</small>
                  <p>{notes}</p>
                </div>
              ) : null}
              <div className="sale-receipt-totals">
                <span className="grand-total">
                  Total <strong>S/ {total.toFixed(2)}</strong>
                </span>
              </div>
            </div>
            <div className="operation-review-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={() => setReviewOpen(false)}
              >
                Volver a editar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => void save()}
              >
                <Check size={16} />{' '}
                {saving ? 'Procesando...' : editing ? 'Guardar cambios' : 'Confirmar venta'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {clienteModal ? (
        <ClienteFormModal onClose={() => setClienteModal(false)} onSaved={handleClienteCreado} />
      ) : null}
    </form>
  );
}
