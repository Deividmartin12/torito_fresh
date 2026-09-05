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
export type ProductionWarehouse = { id: string; codigo: string; nombre: string; tipo: string };
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
  cantidadPlanificada: number;
  cantidadProducida: number;
  costoTotal: number;
  fechaPlanificada: string;
  fechaFin: string | null;
  estado: string;
  lote: string | null;
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

export const getProductionCatalogs = () => api<ProductionCatalogs>('/production/catalogs');
export const getProductionOrders = () => api<ProductionOrder[]>('/production/orders');
// Registrar producción es un solo paso: la orden queda completada de inmediato, sin un
// segundo paso de confirmación.
export const createProductionOrder = (payload: ProductionPayload) =>
  api<ProductionOrder>('/production/orders', { method: 'POST', body: JSON.stringify(payload) });
