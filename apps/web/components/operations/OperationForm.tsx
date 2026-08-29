'use client';

import {
  AlertCircle,
  CalendarClock,
  Check,
  PackageCheck,
  PackagePlus,
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
import { money } from '../../lib/format';
import {
  createPurchase,
  createSale,
  emptyCatalogs,
  emptyLine,
  getOperationCatalogs,
  getOperationStock,
  getOperationalPaymentMethods,
  OperationKind,
  OperationLine,
  OperationalPaymentMethod,
  PaymentType,
  ReceiptType,
  StockRow,
} from '../../lib/operations';
import { ClienteFormModal } from '../ClienteFormModal';
import { SearchableSelect } from '../SearchableSelect';

type FieldErrors = Partial<
  Record<'entity' | 'warehouse' | 'series' | 'number' | 'items' | 'payment' | 'dueDate', string>
>;

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

export function OperationForm({ kind }: { kind: OperationKind }) {
  const sale = kind === 'sale';
  const router = useRouter();
  const backHref = sale ? '/ventas' : '/compras';
  const [catalogs, setCatalogs] = useState(emptyCatalogs);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [entityId, setEntityId] = useState('');
  const [clienteModal, setClienteModal] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  // Comprobante (tipo/serie/número) aplica solo a compras; la venta se identifica por su código.
  const [receiptType, setReceiptType] = useState<ReceiptType>('FACTURA');
  const [series, setSeries] = useState('F001');
  const [number, setNumber] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('CONTADO');
  const [paymentMethods, setPaymentMethods] = useState<OperationalPaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [initialAmount, setInitialAmount] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OperationLine[]>([emptyLine()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    const requests = sale
      ? Promise.all([getOperationCatalogs(), getOperationStock(), getOperationalPaymentMethods()])
      : Promise.all([
          getOperationCatalogs(),
          Promise.resolve([] as StockRow[]),
          getOperationalPaymentMethods(),
        ]);
    requests
      .then(([catalogData, stockData, methods]) => {
        setCatalogs(catalogData);
        setStock(stockData);
        setPaymentMethods(methods);
        setPaymentMethodId(methods.find((method) => !method.requiereOperacion)?.id ?? '');
        setEntityId(sale ? '' : (catalogData.proveedores[0]?.id ?? ''));
        setWarehouseId(catalogData.almacenes[0]?.id ?? '');
      })
      .catch((cause) =>
        toast.error(
          cause instanceof Error
            ? cause.message
            : 'No se pudieron cargar los datos de la operación',
        ),
      )
      .finally(() => setLoading(false));
  }, [sale]);

  const entities = sale ? catalogs.clientes : catalogs.proveedores;
  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Math.max(item.cantidad * item.precioUnitario - item.descuento, 0),
        0,
      ),
    [items],
  );
  const igv = sale ? 0 : subtotal * 0.18;
  const total = subtotal + igv;
  const selectedClient = sale ? entities.find((item) => item.id === entityId) : undefined;
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

  function changeReceiptType(nextType: ReceiptType) {
    setReceiptType(nextType);
    setFieldErrors((current) => ({ ...current, series: undefined }));
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
    updateLine(index, {
      productoId,
      precioUnitario: sale ? (product?.precioVenta ?? 0) : (product?.costoReferencia ?? 0),
    });
  }
  function available(productoId: string) {
    if (!sale || !productoId) return 0;
    const product = catalogs.productos.find((item) => item.id === productoId);
    const warehouse = catalogs.almacenes.find((item) => item.id === warehouseId);
    return stock
      .filter(
        (item) =>
          item.codigo === product?.codigo && item.almacen === warehouse?.nombre && item.vendible,
      )
      .reduce((sum, item) => sum + Math.max(item.cantidad - item.reservada, 0), 0);
  }
  function validate() {
    const next: FieldErrors = {};
    if (!entityId) next.entity = sale ? 'Selecciona un cliente.' : 'Selecciona un proveedor.';
    if (!sale && !warehouseId) next.warehouse = 'Selecciona un almacen.';
    if (!sale && !series.trim()) next.series = 'Ingresa la serie del comprobante.';
    if (!sale && !number.trim()) next.number = 'Ingresa el numero del comprobante.';
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
    else if (sale && items.some((item) => item.cantidad > available(item.productoId)))
      next.items = 'Una cantidad supera el stock disponible del almacen seleccionado.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }
  function openReview() {
    if (validate()) setReviewOpen(true);
  }
  async function save(confirm: boolean) {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        tipoPago: paymentType,
        observaciones: notes,
        items,
        metodoPagoId: paymentMethodId || undefined,
        montoInicial:
          paymentType === 'CONTADO' ? total : paymentType === 'MIXTO' ? initialAmount : 0,
        fechaVencimiento: paymentType === 'CONTADO' ? undefined : dueDate || undefined,
      };
      if (sale) await createSale({ ...payload, clienteId: entityId }, confirm);
      else
        await createPurchase(
          {
            ...payload,
            tipoComprobante: receiptType,
            serie: series,
            numero: number,
            proveedorId: entityId,
            almacenId: warehouseId,
          },
          confirm,
        );
      toast.success(
        `${sale ? 'Venta' : 'Compra'} ${confirm ? 'confirmada' : 'guardada como borrador'}`,
      );
      router.push(backHref);
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : `No se pudo guardar la ${sale ? 'venta' : 'compra'}`,
      );
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
          aria-labelledby={`${kind}-items-title`}
        >
          <div className="operation-section-head">
            <span>1</span>
            <div>
              <h2 id={`${kind}-items-title`}>
                {sale ? 'Productos vendidos' : 'Productos recibidos'}
              </h2>
              <p>
                {sale
                  ? 'Busca productos y registra las cantidades. El stock se valida según el almacén.'
                  : 'Busca productos y registra las cantidades y costos de ingreso.'}
              </p>
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
            <span>{sale ? 'Precio unitario' : 'Costo unitario'}</span>
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
                    }))}
                    placeholder="Buscar por código o nombre"
                    required
                  />
                  {sale ? (
                    <small
                      className={
                        item.productoId && available(item.productoId) < item.cantidad
                          ? 'stock-warning'
                          : 'stock-hint'
                      }
                    >
                      Disponible: {available(item.productoId)}
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
                  <span>{sale ? 'Precio unitario' : 'Costo unitario'}</span>
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
          aria-labelledby={`${kind}-general-title`}
        >
          <div className="operation-section-head">
            <span>2</span>
            <div>
              <h2 id={`${kind}-general-title`}>Datos generales</h2>
              <p>
                {sale
                  ? 'Información de la operación.'
                  : 'Información de la operación y comprobante.'}
              </p>
            </div>
          </div>
          <div className="step-fields operation-fields">
            <label>
              <span>{sale ? 'Cliente' : 'Proveedor'}</span>
              <SearchableSelect
                value={entityId}
                onChange={(value) => {
                  setEntityId(value);
                  setFieldErrors((current) => ({ ...current, entity: undefined }));
                }}
                options={entities.map((item) => ({
                  value: item.id,
                  label: item.documento ? `${item.nombre} · ${item.documento}` : item.nombre,
                }))}
                placeholder={`Buscar ${sale ? 'cliente' : 'proveedor'}`}
                required
                actionLabel={sale ? '+ Agregar cliente' : undefined}
                onAction={sale ? () => setClienteModal(true) : undefined}
              />
              {fieldErrors.entity ? (
                <small className="field-error">{fieldErrors.entity}</small>
              ) : selectedClient && (selectedClient.deudaActual ?? 0) > 0 ? (
                <small className="client-debt-hint">
                  Deuda actual: {money(selectedClient.deudaActual)} ·{' '}
                  {selectedClient.comprobantesPendientes}{' '}
                  {selectedClient.comprobantesPendientes === 1 ? 'comprobante' : 'comprobantes'}
                </small>
              ) : null}
            </label>
            {!sale ? (
              <label>
                <span>Almacén que recibe</span>
                <SearchableSelect
                  value={warehouseId}
                  onChange={(value) => {
                    setWarehouseId(value);
                    setFieldErrors((current) => ({
                      ...current,
                      warehouse: undefined,
                      items: undefined,
                    }));
                  }}
                  options={catalogs.almacenes.map((item) => ({
                    value: item.id,
                    label: item.codigo ? `${item.codigo} · ${item.nombre}` : item.nombre,
                  }))}
                  placeholder="Buscar almacén"
                  required
                />
                {fieldErrors.warehouse ? (
                  <small className="field-error">{fieldErrors.warehouse}</small>
                ) : null}
              </label>
            ) : null}
            {!sale ? (
              <label>
                <span>Tipo de comprobante</span>
                <select
                  value={receiptType}
                  onChange={(event) => changeReceiptType(event.target.value as ReceiptType)}
                >
                  <option>FACTURA</option>
                  <option>BOLETA</option>
                  <option>TICKET</option>
                  <option>NOTA</option>
                  <option>OTRO</option>
                </select>
              </label>
            ) : null}

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
                    <input value={money(total)} readOnly />
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
                  <strong>Esta {sale ? 'venta' : 'compra'} queda a crédito</strong>
                  <span>
                    Quedará pendiente <b>{money(creditAmount)}</b>
                  </span>
                </div>
                <label>
                  <span>
                    {sale ? '¿Cuándo pagará el cliente?' : '¿Cuándo se paga al proveedor?'}
                  </span>
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
            {!sale ? (
              <div className="operation-field-pair operation-receipt-number">
                <label>
                  <span>Serie del comprobante</span>
                  <input
                    value={series}
                    onChange={(event) => {
                      setSeries(event.target.value.toUpperCase());
                      setFieldErrors((current) => ({ ...current, series: undefined }));
                    }}
                    placeholder="F001"
                  />
                  {fieldErrors.series ? (
                    <small className="field-error">{fieldErrors.series}</small>
                  ) : null}
                </label>
                <label>
                  <span>Número</span>
                  <input
                    value={number}
                    onChange={(event) => {
                      setNumber(event.target.value);
                      setFieldErrors((current) => ({ ...current, number: undefined }));
                    }}
                    placeholder="000001"
                  />
                  {fieldErrors.number ? (
                    <small className="field-error">{fieldErrors.number}</small>
                  ) : null}
                </label>
              </div>
            ) : null}
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
        <Link href={backHref} className="btn-secondary">
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
            className="operation-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${kind}-review-title`}
          >
            <div className="operation-review-head">
              <div className="operation-review-icon">
                {sale ? <PackageCheck size={24} /> : <PackagePlus size={24} />}
              </div>
              <div>
                <span>Revisión final</span>
                <h2 id={`${kind}-review-title`}>
                  Confirma los datos de la {sale ? 'venta' : 'compra'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                disabled={saving}
                aria-label="Cerrar resumen"
              >
                <X size={20} />
              </button>
            </div>
            <div className="operation-review-body">
              <div className="operation-review-facts">
                <div>
                  <small>{sale ? 'Cliente' : 'Proveedor'}</small>
                  <strong>
                    {entities.find((item) => item.id === entityId)?.nombre ?? 'Sin seleccionar'}
                  </strong>
                </div>
                {!sale ? (
                  <div>
                    <small>Almacén</small>
                    <strong>
                      {catalogs.almacenes.find((item) => item.id === warehouseId)?.nombre ??
                        'Sin seleccionar'}
                    </strong>
                  </div>
                ) : null}
                {!sale ? (
                  <div>
                    <small>Comprobante</small>
                    <strong>{`${receiptType} ${series}-${number}`}</strong>
                  </div>
                ) : null}
                <div>
                  <small>Pago</small>
                  <strong>
                    {formaPagoLabel[paymentType] ?? paymentType}
                    {paymentType !== 'CONTADO' && dueDate
                      ? ` · ${money(creditAmount)} a crédito · ${resumenVencimiento(dueDate, creditAmount).label.toLowerCase()}`
                      : ''}
                  </strong>
                </div>
              </div>
              <div className="operation-review-products">
                <div className="operation-review-products-head">
                  <strong>Productos</strong>
                  <span>
                    {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>
                {items.map((item, index) => (
                  <div className="operation-review-product" key={`${item.productoId}-${index}`}>
                    <div>
                      <strong>
                        {catalogs.productos.find((product) => product.id === item.productoId)
                          ?.nombre ?? 'Producto'}
                      </strong>
                      <small>
                        {item.cantidad} × S/ {item.precioUnitario.toFixed(2)}
                      </small>
                    </div>
                    <strong>
                      S/{' '}
                      {Math.max(item.cantidad * item.precioUnitario - item.descuento, 0).toFixed(2)}
                    </strong>
                  </div>
                ))}
              </div>
              {notes ? (
                <div className="operation-review-note">
                  <small>Observaciones</small>
                  <p>{notes}</p>
                </div>
              ) : null}
              <div className="totals-box operation-review-totals">
                <span>
                  {sale ? 'Total de productos' : 'Subtotal'}{' '}
                  <strong>S/ {subtotal.toFixed(2)}</strong>
                </span>
                {!sale ? (
                  <span>
                    IGV (18%) <strong>S/ {igv.toFixed(2)}</strong>
                  </span>
                ) : null}
                <span className="grand-total">
                  Total <strong>S/ {total.toFixed(2)}</strong>
                </span>
              </div>
              <p className="auto-note">
                <Check size={15} /> Al confirmar se {sale ? 'descontará' : 'ingresará'} el stock y
                se creará el kardex automáticamente.
              </p>
            </div>
            <div className="operation-review-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={() => setReviewOpen(false)}
              >
                Volver y editar
              </button>
              <div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={saving}
                  onClick={() => void save(false)}
                >
                  {saving ? 'Guardando...' : 'Guardar borrador'}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving}
                  onClick={() => void save(true)}
                >
                  <Check size={16} />{' '}
                  {saving ? 'Procesando...' : `Confirmar ${sale ? 'venta' : 'compra'}`}
                </button>
              </div>
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
