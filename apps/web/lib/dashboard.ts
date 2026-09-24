import { api } from './api';
import { BusinessAnalytics, getBusinessAnalytics } from './analytics';

export type TopProductRow = {
  product?: { id: string; name: string };
  cantidad: number;
  total: number;
};

export type BusinessDashboard = {
  analytics: BusinessAnalytics;
};

export async function getBusinessDashboard(
  from?: string,
  to?: string,
  compare = false,
): Promise<BusinessDashboard> {
  return { analytics: await getBusinessAnalytics(from, to, compare) };
}

/** Panel del repartidor: sus ventas registradas hoy, con la curva por hora del día. */
export type DeliverySummary = {
  fecha: string;
  totales: {
    ventas: number;
    monto: number;
    cobrado: number;
    /** Lo que quedó sin cobrar al momento de la venta. */
    pendiente: number;
    /** Unidades retornables entregadas hoy. */
    bidones: number;
    /** Lo que cobró hoy de deudas viejas, neto de anulaciones. No sale de las ventas de hoy. */
    cobradoDeudas: number;
    /** Todo lo que entró hoy por sus manos: `cobrado` + `cobradoDeudas`. Es lo que debe rendir. */
    cajaDelDia: number;
  };
  /** Las 24 horas del día, siempre completas, para que la curva no cambie de forma. */
  porHora: { hora: number; monto: number }[];
  items: {
    codigo: string;
    fecha: string;
    cliente: string;
    total: number;
    saldo: number;
    estadoPago: string;
    estado: string;
  }[];
};

export function getDeliverySummary() {
  return api<DeliverySummary>('/reports/delivery-summary');
}
