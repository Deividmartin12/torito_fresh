import { api } from './api';

export type PaymentType = 'CONTADO' | 'CREDITO' | 'MIXTO';

export type CatalogItem = {
  id: string;
  nombre: string;
  codigo?: string;
  documento?: string;
  precioVenta?: number;
  costoReferencia?: number;
  /** Deuda vigente del cliente (suma de saldos por cobrar). Solo en `clientes`. */
  deudaActual?: number;
  /** Cantidad de comprobantes con saldo pendiente. Solo en `clientes`. */
  comprobantesPendientes?: number;
  /** Envases nuestros que el cliente todavía no devolvió. Solo en `clientes`. */
  saldoEnvases?: number;
  /** Tope de crédito. `null` = sin límite; 0 = no se le fía. Solo en `clientes`. */
  limiteCredito?: number | null;
  /** Cuánto más se le puede fiar hoy. `null` = sin límite. Solo en `clientes`. */
  creditoDisponible?: number | null;
  /** Cuentas suyas ya vencidas: con una sola, no se le vende a crédito. Solo en `clientes`. */
  vencidas?: number;
  vencido?: number;
  /** Si el producto va en envase retornable (bidón). Solo en `productos`. */
  esRetornable?: boolean;
};

export type OperationCatalogs = {
  clientes: CatalogItem[];
  almacenes: CatalogItem[];
  productos: CatalogItem[];
  estadosInventario: CatalogItem[];
  /**
   * En qué unidad va a quedar la venta, y si esa unidad lleva inventario. Lo resuelve el API con
   * la misma función que usa al guardar, así que es lo que realmente va a pasar y no una
   * suposición del formulario. Importa sobre todo con "Todo consolidado" elegido, donde la
   * unidad del navegador y la del servidor no coinciden.
   */
  unidadEscritura?: { id: string; nombre: string; controlaInventario: boolean };
  preparado: boolean;
};

export type OperationLine = {
  productoId: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
};

export type StockRow = {
  id?: string;
  producto: string;
  codigo: string;
  almacen: string;
  lote: string;
  estado: string;
  vendible: boolean;
  cantidad: number;
  reservada: number;
  minimo: number;
  costo: number;
};

export type OperationDetailLine = {
  id: string;
  productoId: string;
  producto: string;
  cantidad: number;
  cantidadDevuelta: number;
  precio: number;
  descuento: number;
  subtotal: number;
};

export type Sale = {
  id: string;
  codigo: string;
  fecha: string;
  clienteId: string;
  cliente: string;
  clienteDocumento: string | null;
  clienteTipoDocumento: string | null;
  almacenId: string;
  almacen: string;
  pago: string;
  observaciones: string | null;
  subtotal: number;
  igv: number;
  descuento: number;
  total: number;
  totalNeto: number;
  montoInicial: number;
  pagosIniciales: { metodoPagoId: string; metodo: string; monto: number }[];
  fechaVencimiento: string | null;
  cuentaCobrarId: string | null;
  pagado: number;
  saldo: number;
  estado: string;
  estadoPago: string;
  estadoDevolucion: string;
  /**
   * Si la venta fue anulada. No sale de `estado` —una venta anulada sigue CONFIRMADA— sino de
   * su devolución de tipo anulación, que es lo que la deshace. Lo deriva el API.
   */
  anulada: boolean;
  motivoAnulacion: string | null;
  fechaAnulacion: string | null;
  /** Quién autorizó pasar el límite de crédito del cliente, si hizo falta. */
  creditoAutorizadoPor: string | null;
  creditoAutorizadoNota: string | null;
  /** Envases retornables que esta venta entregó, sumando las cantidades de sus líneas. */
  envasesEntregados: number;
  /** Vacíos que el cliente devolvió en el momento. En toda venta anterior a esta función, 0. */
  vaciosRecibidos: number;
  kardexId: string | null;
  kardexRef: string | null;
  items: OperationDetailLine[];
};

export type AccountPayment = {
  id: string;
  fecha: string;
  monto: number;
  metodo: string;
  observaciones: string | null;
  estado: string;
  trabajador: string;
};

export type OperationalAccount = {
  id: string;
  tipo: 'cobrar' | 'pagar';
  tercero: string;
  documento: string;
  comprobante: string;
  emision: string;
  vencimiento: string | null;
  original: number;
  pagado: number;
  saldo: number;
  estado: string;
  pagos: AccountPayment[];
};

export type OperationalPaymentMethod = { id: string; nombre: string };

export type OperationalPaymentPayload = {
  cuentaId: number;
  metodoPagoId: number;
  monto: number;
  fechaPago: string;
  observaciones?: string;
};

export type SaleInitialPayment = { metodoPagoId: number; monto: number };

export type SaleOperationPayload = {
  clienteId: string;
  almacenId?: string;
  tipoPago: PaymentType;
  pagosIniciales?: SaleInitialPayment[];
  fechaVencimiento?: string;
  /** Fecha de emisión (YYYY-MM-DD). Solo se envía al editar una venta. */
  fecha?: string;
  /**
   * Envases vacíos que el cliente entregó en el momento. Lo normal es que devuelva tantos
   * como se lleva, y entonces su saldo de envases no se mueve.
   */
  vaciosDevueltos?: number;
  items: OperationLine[];
};

export const emptyCatalogs: OperationCatalogs = {
  clientes: [],
  almacenes: [],
  productos: [],
  estadosInventario: [],
  preparado: false,
};
export const emptyLine = (): OperationLine => ({
  productoId: '',
  cantidad: 1,
  precioUnitario: 0,
  descuento: 0,
});

export function getOperationCatalogs() {
  return api<OperationCatalogs>('/operations/catalogs');
}
export function getOperationStock() {
  return api<StockRow[]>('/operations/stock');
}
function dateRangeQuery(from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return query.size ? `?${query}` : '';
}
export function getSales(from?: string, to?: string) {
  return api<Sale[]>(`/operations/sales${dateRangeQuery(from, to)}`);
}
/** Última venta confirmada del cliente, para ofrecer "repetir el pedido" en la venta rápida. */
export type LastSale = {
  fecha: string;
  total: number;
  items: { productoId: string; producto: string; cantidad: number; precioUnitario: number }[];
};
export function getLastSale(clienteId: string) {
  return api<LastSale | null>(`/operations/last-sale?clienteId=${encodeURIComponent(clienteId)}`);
}
export function getSale(id: string) {
  return api<Sale>(`/operations/sales/${id}`);
}
// Registrar una venta es un solo paso: queda confirmada de inmediato (descuenta stock y
// genera kardex), sin un paso de confirmación aparte.
export function createSale(payload: SaleOperationPayload) {
  return api<Sale>('/operations/sales', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateSale(id: string, payload: SaleOperationPayload) {
  return api<Sale>(`/operations/sales/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export type AnnulSalePayload = {
  motivo: string;
  /**
   * Con qué medio se le devolvió la plata al cliente. Si no va, el reembolso espeja los
   * cobros originales (cada método con su mismo monto).
   */
  metodoPagoId?: number;
  observaciones?: string;
};

/**
 * Anula una venta. Por dentro genera la devolución total de todo lo que quede por devolver y
 * registra la salida de la plata que el cliente había pagado: no hay un estado "anulada" que
 * se marque, lo que anula la venta es esa devolución. No se puede deshacer.
 */
export function annulSale(id: string, payload: AnnulSalePayload) {
  return api<OperationalReturn>(`/operations/sales/${id}/anular`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export function getOperationalAccounts(type: 'cobrar' | 'pagar', clienteId?: string) {
  const query = clienteId ? `?clienteId=${encodeURIComponent(clienteId)}` : '';
  return api<OperationalAccount[]>(`/operations/accounts/${type}${query}`);
}

export function updateReceivableDueDate(id: string, fechaVencimiento: string) {
  return api<OperationalAccount>(`/operations/accounts/cobrar/${id}/vencimiento`, {
    method: 'PATCH',
    body: JSON.stringify({ fechaVencimiento }),
  });
}
export function getOperationalPaymentMethods() {
  return api<OperationalPaymentMethod[]>('/operations/payment-methods');
}
export function registerOperationalPayment(
  type: 'cobrar' | 'pagar',
  payload: OperationalPaymentPayload,
) {
  return api<OperationalAccount>(`/operations/accounts/${type}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type OperationalReturn = {
  id: string;
  codigo: string;
  tipo: 'VENTA';
  fecha: string;
  operacionId: string;
  comprobante: string;
  tercero: string;
  motivo: string;
  total: number;
  estado: string;
  /**
   * Si nació de anular la venta en vez de un reclamo del cliente. Ojo con `tipo`, que es otra
   * cosa: qué operación se está devolviendo (siempre una venta).
   */
  esAnulacion: boolean;
  /** Plata que salió de la caja al anular, en positivo. Cero en una devolución comercial. */
  reembolsado: number;
  kardexId: string | null;
  kardexRef: string | null;
  saldoFavor: number;
  items: { producto: string; cantidad: number; importe: number; destino: string }[];
};
export type FavorBalance = {
  id: string;
  tipo: 'CLIENTE';
  tercero: string;
  original: number;
  disponible: number;
  estado: string;
  fecha: string;
};
export type ReturnsData = { devoluciones: OperationalReturn[]; saldosFavor: FavorBalance[] };
export type ReturnPayload = {
  operacionId: number;
  motivo: string;
  observaciones?: string;
  items: {
    detalleId: number;
    cantidad: number;
    estadoDestinoId?: number;
    reintegraInventario?: boolean;
  }[];
};
export function getOperationalReturns() {
  return api<ReturnsData>('/operations/returns');
}
export function createOperationalReturn(payload: ReturnPayload) {
  return api<OperationalReturn>('/operations/returns/venta', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/* ---- Kardex / movimientos de inventario ---- */

export type MovementDetail = {
  productoId: string;
  producto: string;
  codigo: string | null;
  almacenId: string;
  almacen: string;
  lote: string;
  estadoInventario: string;
  direccion: 'ENTRADA' | 'SALIDA';
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  saldoAnterior: number;
  saldoPosterior: number;
};

export type Movement = {
  id: string;
  referencia: string;
  fecha: string;
  tipo: string;
  operacion: string;
  operacionLabel: string;
  comprobante: string;
  tercero: string;
  explicacion: string;
  observaciones: string | null;
  responsable: string;
  origen: string;
  destino: string;
  estado: string;
  unidades: number;
  detalles: MovementDetail[];
};

export type MovementFilters = {
  from?: string;
  to?: string;
  productoId?: string;
  almacenId?: string;
  tipoOperacion?: string;
  ref?: string;
};

export function getMovements(filters: MovementFilters = {}) {
  const query = new URLSearchParams();
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  if (filters.productoId) query.set('productoId', filters.productoId);
  if (filters.almacenId) query.set('almacenId', filters.almacenId);
  if (filters.tipoOperacion) query.set('tipoOperacion', filters.tipoOperacion);
  if (filters.ref) query.set('ref', filters.ref);
  return api<Movement[]>(`/operations/movements${query.size ? `?${query}` : ''}`);
}

export type KardexEntry = {
  detalleId: string;
  movimientoId: string;
  fecha: string;
  referencia: string;
  documento: string;
  operacion: string;
  operacionLabel: string;
  tercero: string;
  direccion: 'ENTRADA' | 'SALIDA';
  entrada: number;
  salida: number;
  saldo: number;
  costoUnitario: number;
  costoTotal: number;
  lote: string;
  almacen: string;
  estadoInventario: string;
};

export type KardexLedger = {
  producto: { id: string; nombre: string; codigo: string | null };
  almacen: string;
  saldoInicial: number;
  saldoFinal: number;
  movimientos: KardexEntry[];
};

export function getKardex(params: {
  productoId: string;
  almacenId?: string;
  from?: string;
  to?: string;
}) {
  const query = new URLSearchParams({ productoId: params.productoId });
  if (params.almacenId) query.set('almacenId', params.almacenId);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  return api<KardexLedger>(`/operations/kardex?${query}`);
}
