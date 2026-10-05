import { api } from './api';
import type { PaymentMethod } from './payment-methods';

export type SalePreferences = { metodoPagoId: string | null };

export function getSalePreferences() {
  return api<SalePreferences>('/operations/sale-preferences');
}

export function saveSalePreferences(metodoPagoId: string | null) {
  return api<SalePreferences>('/operations/sale-preferences', {
    method: 'PUT',
    body: JSON.stringify({ metodoPagoId }),
  });
}

export function availableSaleDefault(methods: PaymentMethod[], metodoPagoId: string | null) {
  return methods.find((method) => method.id === metodoPagoId && method.estado)?.id ?? '';
}
