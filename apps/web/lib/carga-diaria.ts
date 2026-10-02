import { api } from './api';

export type CargaMetodo = { id: string; nombre: string; categoriaId: string };

export type CargaProducto = { id: string; nombre: string; precio: number; retornable: boolean };

/** Lo que ya se cargó para un día. Solo vienen los días que tienen algo. */
export type CargaDiaRegistrado = {
  fecha: string;
  productoId: string | null;
  revision: string;
  produccion: { cantidad: number; partes: number[] | null; codigo: string | null } | null;
  ventas: {
    metodoPagoId: string;
    categoriaId: string;
    monto: number;
    cantidad: number;
    codigo: string | null;
  }[];
  gasto: { monto: number; partes: number[] | null } | null;
};

export type CargaResumen = {
  /** Hoy en Lima (YYYY-MM-DD): no se cargan días posteriores. */
  hoy: string;
  controlaInventario: boolean;
  metodos: CargaMetodo[];
  historicos: CargaMetodo[];
  productos: CargaProducto[];
  productoPorDefectoId: string | null;
  dias: CargaDiaRegistrado[];
};

export type CargaDiaPayload = {
  fecha: string;
  editar?: boolean;
  revision?: string;
  produccion?: number;
  producciones?: number[];
  ventas?: { metodoPagoId: number; monto: number }[];
  gasto?: number;
  gastos?: number[];
};

export type CargaResultado = { fecha: string; ok: boolean; error?: string };

export const getCargaDiaria = (desde: string, hasta: string) =>
  api<CargaResumen>(
    `/carga-diaria?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
  );

export const registrarCargaDiaria = (productoId: string, dias: CargaDiaPayload[]) =>
  api<{ resultados: CargaResultado[] }>('/carga-diaria', {
    method: 'POST',
    body: JSON.stringify({ productoId: Number(productoId), dias }),
  });
