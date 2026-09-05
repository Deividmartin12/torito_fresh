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
};

export type OperationCatalogs = {
  clientes: CatalogItem[];
  almacenes: CatalogItem[];
  productos: CatalogItem[];
  estadosInventario: CatalogItem[];
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
  fechaVencimiento: string | null;
  cuentaCobrarId: string | null;
  pagado: number;
  saldo: number;
  estado: string;
  estadoPago: string;
  estadoDevolucion: string;
  kardexId: string | null;
  kardexRef: string | null;
  items: OperationDetailLine[];
};

export type AccountPayment = {
  id: string;
  fecha: string;
  monto: number;
  metodo: string;
  numeroOperacion: string | null;
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

export type OperationalPaymentMethod = { id: string; nombre: string; requiereOperacion: boolean };

export type OperationalPaymentPayload = {
  cuentaId: number;
  metodoPagoId: number;
  monto: number;
  fechaPago: string;
  numeroOperacion?: string;
  observaciones?: string;
};

export type SaleOperationPayload = {
  clienteId: string;
  almacenId?: string;
  tipoPago: PaymentType;
  observaciones: string;
  metodoPagoId?: string;
  montoInicial?: number;
  fechaVencimiento?: string;
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
