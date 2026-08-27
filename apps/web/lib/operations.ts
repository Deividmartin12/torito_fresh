import { api } from './api';

export type OperationKind = 'sale' | 'purchase';
export type PaymentType = 'CONTADO' | 'CREDITO' | 'MIXTO';
export type ReceiptType = 'FACTURA' | 'BOLETA' | 'TICKET' | 'NOTA' | 'OTRO';

export type CatalogItem = {
  id: string;
  nombre: string;
  codigo?: string;
  documento?: string;
  precioVenta?: number;
  costoReferencia?: number;
};

export type OperationCatalogs = {
  proveedores: CatalogItem[];
  clientes: CatalogItem[];
  almacenes: CatalogItem[];
  productos: CatalogItem[];
  seriesVenta: Record<ReceiptType, string[]>;
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
  producto: string;
  cantidad: number;
  cantidadDevuelta: number;
  precio: number;
  subtotal: number;
};

export type Sale = {
  id: string;
  codigo: string;
  tipoComprobante: ReceiptType;
  serie: string;
  numero: string;
  comprobante: string;
  fecha: string;
  cliente: string;
  almacen: string;
  pago: string;
  subtotal: number;
  igv: number;
  total: number;
  totalNeto: number;
  montoInicial: number;
  fechaVencimiento: string | null;
  pagado: number;
  saldo: number;
  estado: string;
  estadoPago: string;
  estadoDevolucion: string;
  kardexId: string | null;
  items: OperationDetailLine[];
};

export type Purchase = {
  id: string;
  codigo: string;
  tipoComprobante: ReceiptType;
  serie: string;
  numero: string;
  comprobante: string;
  fecha: string;
  proveedor: string;
  almacen: string;
  pago: string;
  subtotal: number;
  igv: number;
  total: number;
  totalNeto: number;
  montoInicial: number;
  fechaVencimiento: string | null;
  pagado: number;
  saldo: number;
  estado: string;
  estadoPago: string;
  estadoDevolucion: string;
  kardexId: string | null;
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

type BaseOperationPayload = {
  almacenId?: string;
  tipoPago: PaymentType;
  observaciones: string;
  metodoPagoId?: string;
  montoInicial?: number;
  fechaVencimiento?: string;
  items: OperationLine[];
};

export type SaleOperationPayload = BaseOperationPayload & { clienteId: string };
export type PurchaseOperationPayload = BaseOperationPayload & {
  tipoComprobante: ReceiptType;
  serie: string;
  numero: string;
  proveedorId: string;
  almacenId: string;
};

export const emptyCatalogs: OperationCatalogs = {
  proveedores: [],
  clientes: [],
  almacenes: [],
  productos: [],
  seriesVenta: { BOLETA: [], FACTURA: [], TICKET: [], NOTA: [], OTRO: [] },
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
export function getSales() {
  return api<Sale[]>('/operations/sales');
}
export function getPurchases() {
  return api<Purchase[]>('/operations/purchases');
}
export function createSale(payload: SaleOperationPayload, confirm: boolean) {
  return api<Sale>(`/operations/sales?confirm=${confirm}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export function createPurchase(payload: PurchaseOperationPayload, confirm: boolean) {
  return api<Purchase>(`/operations/purchases?confirm=${confirm}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export function confirmSale(id: string) {
  return api<Sale>(`/operations/sales/${id}/confirm`, { method: 'POST' });
}
export function confirmPurchase(id: string) {
  return api<Purchase>(`/operations/purchases/${id}/confirm`, { method: 'POST' });
}
export function getOperationalAccounts(type: 'cobrar' | 'pagar') {
  return api<OperationalAccount[]>(`/operations/accounts/${type}`);
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
  tipo: 'VENTA' | 'COMPRA';
  fecha: string;
  operacionId: string;
  comprobante: string;
  tercero: string;
  motivo: string;
  total: number;
  estado: string;
  kardexId: string | null;
  saldoFavor: number;
  items: { producto: string; cantidad: number; importe: number; destino: string }[];
};
export type FavorBalance = {
  id: string;
  tipo: 'CLIENTE' | 'PROVEEDOR';
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
export function createOperationalReturn(type: 'venta' | 'compra', payload: ReturnPayload) {
  return api<OperationalReturn>(`/operations/returns/${type}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
