import { api } from './api';

/**
 * Un método de pago es una categoría (YAPE) + una referencia (el número) + un dueño
 * opcional. `nombre` llega ya armado desde el servidor y es lo que se muestra en toda la app
 * (venta, cobro, reportes) y se forma con categoría + referencia.
 */
export type PaymentMethod = {
  id: string;
  nombre: string;
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

/** Orden único para el CRUD y para las listas que se actualizan después de un alta inline. */
export function sortPaymentMethods(methods: PaymentMethod[]) {
  return [...methods].sort(
    (a, b) =>
      (a.categoria ?? '').localeCompare(b.categoria ?? '', 'es') ||
      (a.referencia ?? '').localeCompare(b.referencia ?? '', 'es') ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );
}

/**
 * En un combo pueden coexistir un método global y uno propio con el mismo nombre. El CRUD
 * los distingue con su columna Dueño; los combos llevan esa misma información en la etiqueta.
 */
export function paymentMethodOptionLabel(method: PaymentMethod) {
  return `${method.nombre} · ${method.trabajador ?? 'Todos'}`;
}

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
export function updatePaymentMethodCategory(
  id: string,
  payload: Partial<PaymentMethodCategoryPayload>,
) {
  return api<PaymentMethodCategory>(`/payment-methods/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
export function deletePaymentMethodCategory(id: string) {
  return api<{ id: string }>(`/payment-methods/categories/${id}`, { method: 'DELETE' });
}

/**
 * Alta de un método desde los combos de venta y cobro. A diferencia de la pantalla de
 * administración (solo ADMIN), este endpoint lo puede usar cualquier operador y siempre
 * registra el método a su propio nombre.
 */
export function createOwnPaymentMethod(payload: { categoriaId: string; referencia?: string }) {
  return api<PaymentMethod>('/operations/payment-methods', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export function getOwnPaymentMethodCategories() {
  return api<PaymentMethodCategory[]>('/operations/payment-method-categories');
}
