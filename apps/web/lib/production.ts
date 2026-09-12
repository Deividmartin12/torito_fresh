import { api } from './api';

export type ProductionProduct = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  unidad: string;
  controlaLote: boolean;
  retornable: boolean;
};
export type ProductionWarehouse = { id: string; codigo: string; nombre: string };
export type ProductionCatalogs = {
  productosTerminados: ProductionProduct[];
  insumos: ProductionProduct[];
  almacenes: ProductionWarehouse[];
};
export type ProductionOrder = {
  id: string;
  codigo: string;
  producto: string;
  productoId: string;
  almacenInsumos: string;
  almacenProductoTerminado: string;
  almacenProductoTerminadoId: string;
  cantidadPlanificada: number;
  cantidadProducida: number;
  costoTotal: number;
  fechaPlanificada: string;
  fechaVencimiento: string | null;
  fechaFin: string | null;
  estado: string;
  lote: string | null;
  // El lote ya tiene ventas/devoluciones: al editar solo se pueden corregir las fechas.
  loteMovido?: boolean;
  responsable: string;
  kardexId: string | null;
  kardexRef: string | null;
  insumos: { producto: string; productoId: string; planificada: number; consumida: number }[];
};
export type ProductionPayload = {
  productoId: string;
  almacenProductoTerminadoId?: string;
  cantidadPlanificada: number;
  fechaPlanificada: string;
  fechaVencimiento?: string;
  insumos?: { productoId: string; cantidad: number }[];
};

// Editar no cambia el producto terminado (eso sería otro lote); sí cantidad, fechas,
// almacén destino e insumos.
export type UpdateProductionPayload = Omit<ProductionPayload, 'productoId'>;

export const getProductionCatalogs = () => api<ProductionCatalogs>('/production/catalogs');
export const getProductionOrders = () => api<ProductionOrder[]>('/production/orders');
// Registrar producción es un solo paso: la orden queda completada de inmediato, sin un
// segundo paso de confirmación.
export const createProductionOrder = (payload: ProductionPayload) =>
  api<ProductionOrder>('/production/orders', { method: 'POST', body: JSON.stringify(payload) });
// Editar revierte el movimiento de inventario anterior y lo rehace con los datos nuevos.
export const updateProductionOrder = (id: string, payload: UpdateProductionPayload) =>
  api<ProductionOrder>(`/production/orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
