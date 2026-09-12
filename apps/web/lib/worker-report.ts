import { api } from './api';

/** Una línea de desglose: forma de cobro, forma de pago o categoría de gasto. */
export type WorkerBreakdownItem = { name: string; amount: number; count: number };

export type WorkerReportRow = {
  id: string;
  nombre: string;
  cargo: string;
  activo: boolean;
  /** Ventas confirmadas que registró, netas de devoluciones. */
  ventas: { count: number; total: number };
  ventasPorMetodo: WorkerBreakdownItem[];
  /** Gastos de "Pago a trabajador" en los que él es el beneficiario. */
  pagosRecibidos: { count: number; total: number };
  pagosPorMetodo: WorkerBreakdownItem[];
  /** Gastos que él cargó al sistema, cualquiera sea la categoría. */
  gastosRegistrados: { count: number; total: number };
  gastosPorCategoria: WorkerBreakdownItem[];
};

export type WorkerReport = {
  range: { from: string; to: string };
  /** Nombres de columna de cada tabla, ya ordenados. */
  metodosVenta: string[];
  metodosPago: string[];
  categoriasGasto: string[];
  totals: {
    ventas: number;
    montoVendido: number;
    pagosRecibidos: number;
    montoPagado: number;
    gastosRegistrados: number;
    montoGastos: number;
  };
  workers: WorkerReportRow[];
};

export function getWorkerReport(from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return api<WorkerReport>(`/reports/workers${query.size ? `?${query}` : ''}`);
}

/** Monto de un desglose para una columna dada, o 0 si el trabajador no tuvo movimiento ahí. */
export const montoDe = (breakdown: WorkerBreakdownItem[], name: string) =>
  breakdown.find((item) => item.name === name)?.amount ?? 0;

export const conteoDe = (breakdown: WorkerBreakdownItem[], name: string) =>
  breakdown.find((item) => item.name === name)?.count ?? 0;
