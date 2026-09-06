'use client';

import {
  AlertCircle,
  CalendarClock,
  Check,
  ChevronDown,
  PiggyBank,
  Plus,
  ReceiptText,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Cliente } from '../../lib/clients';
import { formaPagoLabel, formaPagoOpciones, resumenVencimiento } from '../../lib/credit';
import { fechaCorta, moneda } from '../../lib/format';
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

type PagoLinea = { metodoPagoId: string; monto: number };

const iconoFormaPago = { CONTADO: Wallet, CREDITO: CalendarClock, MIXTO: PiggyBank } as const;

/** Importe de una línea: cantidad x precio unitario, menos el descuento, redondeado al centavo.
 *  Es la misma fórmula que usa el servidor (`OperationsService.lineTotal`), así que lo que ves
 *  en pantalla es exactamente lo que se guarda. */
const importeDeLinea = (linea: OperationLine) =>
  Math.round(Math.max(linea.cantidad * linea.precioUnitario - linea.descuento, 0) * 100) / 100;

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const localTodayPlus = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/**
 * Input numérico que no pelea con el 0 inicial:
 * - Al enfocar selecciona todo, así lo que se escribe reemplaza al 0.
 * - Permite borrar todo y escribir de cero (no se reimpone el 0 a mitad de edición).
 * - Quita ceros a la izquierda ("007" -> "7", pero conserva "0" y "0.5").
 * - Deja escribir decimales ("12." no pierde el punto mientras se escribe).
 * - Al salir del campo se reacomoda al valor real.
 */
export function NumericField({
  value,
  onCommit,
  integer = false,
  disabled = false,
}: {
  value: number;
  onCommit: (next: number) => void;
  integer?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Si el valor cambia desde fuera (elegir producto, importe calculado),
  // se reacomoda solo cuando el campo no está en edición.
  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) setText(null);
  }, [value]);

  const display = text ?? String(value);

  const normalize = (raw: string) => {
    let next = integer ? raw.replace(/[^0-9]/g, '') : raw.replace(/[^0-9.]/g, '');
    if (!integer) {
      const [head, ...rest] = next.split('.');
      if (rest.length > 0) next = `${head}.${rest.join('')}`;
    }
    return next.replace(/^0+(?=\d)/, '');
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={display}
      disabled={disabled}
      onFocus={(event) => event.target.select()}
      onChange={(event) => {
        const next = normalize(event.target.value);
        setText(next);
        if (next === '' || next === '.') {
          onCommit(0);
          return;
        }
        const parsed = integer ? parseInt(next, 10) : Number(next);
        if (Number.isFinite(parsed)) onCommit(integer ? Math.max(parsed, 0) : parsed);
      }}
      onBlur={() => setText(null)}
    />
  );
}

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
  // Cobro del momento, repartible en varios métodos (ej. una parte en efectivo y otra en Yape).
  const [pagos, setPagos] = useState<PagoLinea[]>([{ metodoPagoId: '', monto: 0 }]);
  const [dueDate, setDueDate] = useState('');
  // Fecha de emisión. Al registrar es siempre hoy; al editar se puede corregir.
  const [fecha, setFecha] = useState('');
  const [items, setItems] = useState<OperationLine[]>([emptyLine()]);
  // Solo al editar: la venta tal como estaba guardada. Sirve para calcular bien el stock
  // disponible, porque lo que esta venta ya descontó vuelve al almacén al guardar los cambios.
  const [ventaOriginal, setVentaOriginal] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // "Pago completo" es lo más usado y va siempre visible; crédito/mixto se despliegan solo si se necesitan.
  const [payMoreOpen, setPayMoreOpen] = useState(false);

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
          setFecha(sale.fecha ? sale.fecha.slice(0, 10) : '');
          // Se precarga TODO lo de la venta (incluidos crédito y descuentos). Si no, al
          // guardar se perdía el descuento —y el total subía solo— y una venta a crédito
          // pedía una fecha de vencimiento nueva cada vez que se editaba.
          setDueDate(sale.fechaVencimiento ? sale.fechaVencimiento.slice(0, 10) : '');
          setPagos(
            sale.pagosIniciales.length
              ? sale.pagosIniciales.map((pago) => ({
                  metodoPagoId: pago.metodoPagoId,
                  monto: pago.monto,
                }))
              : [{ metodoPagoId: methods[0]?.id ?? '', monto: 0 }],
          );
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
          setPagos([{ metodoPagoId: methods[0]?.id ?? '', monto: 0 }]);
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
    () => items.reduce((sum, item) => sum + importeDeLinea(item), 0),
    [items],
  );
  const total = subtotal;
  const selectedClient = catalogs.clientes.find((item) => item.id === entityId);
  const pagosTotal = useMemo(
    () => Math.round(pagos.reduce((sum, pago) => sum + (pago.monto || 0), 0) * 100) / 100,
    [pagos],
  );
  const creditAmount =
    paymentType === 'MIXTO' ? Math.max(Math.round((total - pagosTotal) * 100) / 100, 0) : total;
  // En pago completo con un solo método el monto es el total y no se escribe a mano.
  const contadoSingle = paymentType === 'CONTADO' && pagos.length === 1;
  useEffect(() => {
    if (contadoSingle && pagos[0].monto !== total) {
      setPagos((current) => [{ ...current[0], monto: total }]);
    }
  }, [contadoSingle, pagos, total]);

  function updatePago(index: number, patch: Partial<PagoLinea>) {
    setPagos((current) =>
      current.map((pago, position) => (position === index ? { ...pago, ...patch } : pago)),
    );
    setFieldErrors((current) => ({ ...current, payment: undefined }));
  }
  function addPago() {
    setPagos((current) => [...current, { metodoPagoId: paymentMethods[0]?.id ?? '', monto: 0 }]);
  }
  function removePago(index: number) {
    setPagos((current) => current.filter((_, position) => position !== index));
  }

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
    // Al quitar el producto la línea se reinicia a sus valores iniciales.
    if (!productoId) {
      updateLine(index, { ...emptyLine(), productoId: '' });
      return;
    }
    const product = catalogs.productos.find((item) => item.id === productoId);
    updateLine(index, { productoId, precioUnitario: product?.precioVenta ?? 0 });
  }
  function selectPaymentType(next: PaymentType) {
    setPaymentType(next);
    setFieldErrors((current) => ({ ...current, payment: undefined, dueDate: undefined }));
    // Al pasar a mixto, el abono se escribe a mano: se limpia el monto que venía pegado al total.
    if (next === 'MIXTO' && pagos.length === 1 && pagos[0].monto >= total) {
      setPagos([{ ...pagos[0], monto: 0 }]);
    }
  }
  // El desplegable se abre solo si ya hay crédito/mixto elegido (p. ej. al editar una venta).
  const payExpanded = payMoreOpen || paymentType !== 'CONTADO';
  function togglePayMore() {
    // Si se recoge con crédito/mixto elegido, se vuelve a pago completo.
    if (paymentType !== 'CONTADO') {
      selectPaymentType('CONTADO');
      setPayMoreOpen(false);
    } else {
      setPayMoreOpen((open) => !open);
    }
  }
  const payToggleLabel = !payExpanded
    ? 'Ver otras formas de pago'
    : paymentType !== 'CONTADO'
      ? 'Volver a pago completo'
      : 'Ocultar opciones';
  /**
   * El importe de la línea se puede escribir directo: en vez de calcular el precio unitario
   * a mano ("le cobro 45 por los 5 bidones"), se escribe 45 y el precio sale solo.
   *
   * El importe no se guarda: la fuente de verdad sigue siendo cantidad x precio unitario, que
   * es lo que el servidor recalcula. Por eso, si la división no da exacta, el importe se
   * reacomoda al centavo más cercano apenas se recalcula el precio.
   */
  function escribirImporte(index: number, importe: number) {
    const linea = items[index];
    if (!Number.isInteger(linea.cantidad) || linea.cantidad < 1) return;
    const precio = (importe + linea.descuento) / linea.cantidad;
    updateLine(index, { precioUnitario: Math.round(precio * 100) / 100 });
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
    if (paymentType !== 'CREDITO') {
      if (pagos.some((pago) => !pago.metodoPagoId || pago.monto <= 0))
        next.payment = 'Cada método de pago necesita un método elegido y un monto mayor a cero.';
      else if (paymentType === 'CONTADO' && Math.abs(pagosTotal - total) > 0.005)
        next.payment = 'Los métodos de pago deben sumar el total de la venta.';
      else if (paymentType === 'MIXTO' && (pagosTotal <= 0 || pagosTotal >= total))
        next.payment = 'En pago mixto, el abono debe ser mayor a cero y menor que el total.';
    }
    if (paymentType !== 'CONTADO' && !dueDate)
      next.dueDate = 'Selecciona cuándo vence el saldo pendiente.';
    else if (dueDate && dueDate < localToday())
      next.dueDate = 'La fecha de vencimiento no puede estar en el pasado.';
    if (
      items.some(
        (item) => !item.productoId || !Number.isInteger(item.cantidad) || item.cantidad < 1,
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
        items,
        pagosIniciales:
          paymentType === 'CREDITO'
            ? undefined
            : pagos.map((pago) => ({ metodoPagoId: Number(pago.metodoPagoId), monto: pago.monto })),
        fechaVencimiento: paymentType === 'CONTADO' ? undefined : dueDate || undefined,
        // La fecha solo se puede tocar al editar; en una venta nueva la pone el servidor (hoy).
        fecha: editing ? fecha || undefined : undefined,
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
                  <NumericField
                    value={item.cantidad}
                    integer
                    disabled={!item.productoId}
                    onCommit={(cantidad) => updateLine(index, { cantidad })}
                  />
                </label>
                <label>
                  <span>Precio unitario</span>
                  <NumericField
                    value={item.precioUnitario}
                    disabled={!item.productoId}
                    onCommit={(precioUnitario) => updateLine(index, { precioUnitario })}
                  />
                </label>
                <label>
                  <span>Importe</span>
                  <NumericField
                    value={importeDeLinea(item)}
                    disabled={!item.productoId}
                    onCommit={(importe) => escribirImporte(index, importe)}
                  />
                </label>
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
            {editing ? (
              <label>
                <span>Fecha de la venta</span>
                <input
                  type="date"
                  max={localToday()}
                  value={fecha}
                  onChange={(event) => setFecha(event.target.value)}
                />
              </label>
            ) : null}
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
              <div className="payment-type-row">
                <button
                  type="button"
                  role="radio"
                  aria-checked={paymentType === 'CONTADO'}
                  className={
                    paymentType === 'CONTADO' ? 'payment-type-main active' : 'payment-type-main'
                  }
                  onClick={() => selectPaymentType('CONTADO')}
                >
                  <Wallet size={20} aria-hidden="true" />
                  <div>
                    <strong>Pago completo</strong>
                  </div>
                  {paymentType === 'CONTADO' ? (
                    <Check size={18} className="payment-type-check" aria-hidden="true" />
                  ) : null}
                </button>
                <button
                  type="button"
                  className="payment-type-toggle"
                  aria-expanded={payExpanded}
                  aria-label={payToggleLabel}
                  title={payToggleLabel}
                  onClick={togglePayMore}
                >
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
              </div>
              {payExpanded ? (
                <div
                  className="payment-type-options"
                  role="radiogroup"
                  aria-label="Otras formas de pago"
                >
                  {formaPagoOpciones
                    .filter((option) => option.value !== 'CONTADO')
                    .map((option) => {
                      const Icono = iconoFormaPago[option.value];
                      return (
                        <button
                          type="button"
                          key={option.value}
                          role="radio"
                          aria-checked={paymentType === option.value}
                          className={paymentType === option.value ? 'active' : ''}
                          onClick={() => selectPaymentType(option.value)}
                        >
                          <Icono size={20} aria-hidden="true" />
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                </div>
              ) : null}
            </div>

            {paymentType !== 'CREDITO' ? (
              <div className="payment-methods-field">
                <div className="payment-methods-head">
                  <span className="label">
                    {paymentType === 'MIXTO' ? 'Métodos del abono inicial' : 'Métodos de pago'}
                  </span>
                  <button type="button" className="payment-method-add" onClick={addPago}>
                    <Plus size={14} aria-hidden="true" /> Agregar método
                  </button>
                </div>
                {pagos.map((pago, index) => (
                  <div className="payment-method-row" key={index}>
                    <select
                      value={pago.metodoPagoId}
                      onChange={(event) => updatePago(index, { metodoPagoId: event.target.value })}
                    >
                      <option value="">Seleccionar método</option>
                      {paymentMethods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.nombre}
                        </option>
                      ))}
                    </select>
                    {contadoSingle ? (
                      <input value={moneda(total)} readOnly />
                    ) : (
                      <NumericField
                        value={pago.monto}
                        onCommit={(monto) => updatePago(index, { monto })}
                      />
                    )}
                    {pagos.length > 1 ? (
                      <button
                        type="button"
                        className="payment-method-remove"
                        onClick={() => removePago(index)}
                        aria-label={`Quitar método ${index + 1}`}
                      >
                        <X size={15} />
                      </button>
                    ) : null}
                  </div>
                ))}
                <div className="payment-methods-summary">
                  {paymentType === 'CONTADO' ? (
                    Math.abs(pagosTotal - total) < 0.005 ? (
                      <span>Cubre el total de {moneda(total)}</span>
                    ) : pagosTotal < total ? (
                      <span className="payment-methods-warn">
                        Falta asignar {moneda(total - pagosTotal)}
                      </span>
                    ) : (
                      <span className="payment-methods-warn">
                        Te pasaste por {moneda(pagosTotal - total)}
                      </span>
                    )
                  ) : (
                    <span>
                      Abona {moneda(pagosTotal)} · queda a crédito <b>{moneda(creditAmount)}</b>
                    </span>
                  )}
                </div>
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
                  <span>{fechaCorta(editing && fecha ? fecha : new Date())}</span>
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
                {paymentType !== 'CREDITO' ? (
                  <div>
                    <small>{paymentType === 'MIXTO' ? 'Abono inicial' : 'Pago'}</small>
                    <span>
                      {pagos
                        .map(
                          (pago) =>
                            `${
                              paymentMethods.find((method) => method.id === pago.metodoPagoId)
                                ?.nombre ?? 'Método'
                            } ${moneda(pago.monto)}`,
                        )
                        .join(' · ')}
                    </span>
                  </div>
                ) : null}
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
                      <td>S/ {importeDeLinea(item).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
