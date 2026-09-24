import { api } from './api';

export type CargaCategoria = { id: string; nombre: string };

export type CargaProducto = { id: string; nombre: string; precio: number; retornable: boolean };

/** Lo que ya se cargó para un día. Solo vienen los días que tienen algo. */
export type CargaDiaRegistrado = {
  fecha: string;
  produccion: { cantidad: number; codigo: string | null } | null;
  ventas: { categoriaId: string; monto: number; cantidad: number; codigo: string | null }[];
  gasto: { monto: number } | null;
};

export type CargaResumen = {
  /** Hoy en Lima (YYYY-MM-DD): no se cargan días posteriores. */
  hoy: string;
  controlaInventario: boolean;
  categorias: CargaCategoria[];
  productos: CargaProducto[];
  productoPorDefectoId: string | null;
  dias: CargaDiaRegistrado[];
};

export type CargaDiaPayload = {
  fecha: string;
  produccion?: number;
  ventas?: { categoriaId: number; monto: number }[];
  gasto?: number;
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
