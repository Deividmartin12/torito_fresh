import { api } from './api';

/**
 * Un método de pago es una categoría (YAPE) + una referencia (el número) + un dueño
 * opcional. `nombre` llega ya armado desde el servidor y es lo que se muestra en toda la app
 * (venta, cobro, reportes); `nombreLibre` es la etiqueta editable ("Yape del negocio").
 */
export type PaymentMethod = {
  id: string;
  nombre: string;
  nombreLibre: string | null;
  categoriaId: string | null;
  categoria: string | null;
  icono: string | null;
  referencia: string | null;
  trabajadorId: string | null;
  trabajador: string | null;
  estado: boolean;
};

export type PaymentMethodCategory = {
  id: string;
  nombre: string;
  icono: string | null;
  requiereReferencia: boolean;
  estado: boolean;
  metodos: number;
};

export type PaymentMethodPayload = {
  categoriaId: string;
  nombre?: string;
  referencia?: string;
  trabajadorId?: string;
  estado?: boolean;
};

export type PaymentMethodCategoryPayload = {
  nombre: string;
  icono?: string;
  requiereReferencia?: boolean;
  estado?: boolean;
};

export function getPaymentMethods() {
  return api<PaymentMethod[]>('/payment-methods');
}
export function createPaymentMethod(payload: PaymentMethodPayload) {
  return api<PaymentMethod>('/payment-methods', { method: 'POST', body: JSON.stringify(payload) });
}
export function updatePaymentMethod(id: string, payload: Partial<PaymentMethodPayload>) {
  return api<PaymentMethod>(`/payment-methods/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function getPaymentMethodCategories() {
  return api<PaymentMethodCategory[]>('/payment-methods/categories');
}
export function createPaymentMethodCategory(payload: PaymentMethodCategoryPayload) {
  return api<PaymentMethodCategory>('/payment-methods/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Alta de un método desde los combos de venta y cobro. A diferencia de la pantalla de
 * administración (solo ADMIN), este endpoint lo puede usar cualquier operador y siempre
 * registra el método a su propio nombre.
 */
export function createOwnPaymentMethod(payload: {
  categoriaId: string;
  referencia?: string;
  nombre?: string;
}) {
  return api<PaymentMethod>('/operations/payment-methods', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export function getOwnPaymentMethodCategories() {
  return api<PaymentMethodCategory[]>('/operations/payment-method-categories');
}
