import { api } from './api';
import { BusinessAnalytics, getBusinessAnalytics } from './analytics';

export type SalesPeriodRow = {
  date: string;
  total: number;
  paid: number;
  debt: number;
  count: number;
};
export type TopProductRow = {
  product?: { id: string; name: string };
  quantity: number;
  total: number;
};

export type BusinessDashboard = {
  analytics: BusinessAnalytics;
};

export async function getBusinessDashboard(from?: string, to?: string): Promise<BusinessDashboard> {
  return { analytics: await getBusinessAnalytics(from, to) };
}

/** Panel simple del repartidor: sus ventas registradas hoy. */
export type DeliverySummary = {
  fecha: string;
  totales: { ventas: number; monto: number; cobrado: number };
  items: {
    codigo: string;
    cliente: string;
    total: number;
    estadoPago: string;
    estado: string;
  }[];
};

export function getDeliverySummary() {
  return api<DeliverySummary>('/reports/delivery-summary');
}
