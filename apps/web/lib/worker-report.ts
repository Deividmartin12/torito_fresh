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
  /**
   * Plata que se le PAGÓ a él: gastos de "Pago a trabajador" donde es el beneficiario
   * (sueldos, adelantos). No confundir con `cobranzas`, que es plata que él recibió de
   * clientes y tiene que rendir.
   */
  pagosRecibidos: { count: number; total: number };
  pagosPorMetodo: WorkerBreakdownItem[];
  /**
   * Plata que él COBRÓ de deudas viejas, en la calle, con los reembolsos de anulaciones ya
   * restados. No incluye el cobro del momento de la venta: eso ya está en `ventasPorMetodo`.
   */
  cobranzas: { count: number; total: number };
  cobranzasPorMetodo: WorkerBreakdownItem[];
  /** Gastos que él cargó al sistema, cualquiera sea la categoría. */
  gastosRegistrados: { count: number; total: number };
  gastosPorCategoria: WorkerBreakdownItem[];
};

export type WorkerReport = {
  range: { from: string; to: string };
  /** Nombres de columna de cada tabla, ya ordenados. */
  metodosVenta: string[];
  metodosPago: string[];
  metodosCobranza: string[];
  categoriasGasto: string[];
  totals: {
    ventas: number;
    montoVendido: number;
    pagosRecibidos: number;
    montoPagado: number;
    cobranzas: number;
    montoCobrado: number;
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
