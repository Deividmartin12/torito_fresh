import { api } from './api';

/**
 * Categoría fija del sistema: el gasto de esta categoría es la remuneración de un
 * trabajador y exige un beneficiario. El API la crea en la migración y bloquea renombrarla
 * o eliminarla (ver `apps/api/src/common/expense-categories.ts`), así que el nombre se
 * puede comparar de frente.
 */
export const CATEGORIA_PAGO_TRABAJADOR = 'Pago a trabajador';

export const esPagoTrabajador = (categoria: string) =>
  categoria.trim().toLocaleLowerCase('es') === CATEGORIA_PAGO_TRABAJADOR.toLowerCase();

export type Expense = {
  id: string;
  fecha: string;
  concepto: string;
  categoria: string;
  monto: number;
  comprobante: string | null;
  observaciones: string | null;
  proveedorId: string | null;
  proveedor: string | null;
  /** Quién registró el gasto. */
  registradoPor: string | null;
  /** A quién se le paga. Solo lo llenan los gastos de `CATEGORIA_PAGO_TRABAJADOR`. */
  beneficiarioId: string | null;
  beneficiario: string | null;
  metodoPagoId: string | null;
  metodoPago: string | null;
};

export type CreateExpensePayload = Pick<Expense, 'fecha' | 'concepto' | 'categoria' | 'monto'> & {
  comprobante?: string;
  observaciones?: string;
  proveedorId?: string;
  beneficiarioId?: string;
  metodoPagoId?: string;
};

export type ExpenseCategory = { id: string; nombre: string; sistema: boolean };
export type ExpenseProveedor = { id: string; razonSocial: string; estado: boolean };

export function getExpenses(from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return api<Expense[]>(`/expenses${query.size ? `?${query}` : ''}`);
}
export function createExpense(payload: CreateExpensePayload) {
  return api<Expense>('/expenses', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateExpense(id: string, payload: CreateExpensePayload) {
  return api<Expense>(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export function getExpenseCategories() {
  return api<ExpenseCategory[]>('/expenses/categories');
}
export function createExpenseCategory(categoria: string) {
  return api<ExpenseCategory>('/expenses/categories', {
    method: 'POST',
    body: JSON.stringify({ categoria }),
  });
}
export function updateExpenseCategory(id: string, categoria: string) {
  return api<ExpenseCategory>(`/expenses/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ categoria }),
  });
}
export function deleteExpenseCategory(id: string) {
  return api<{ id: string }>(`/expenses/categories/${id}`, { method: 'DELETE' });
}
export function getExpenseProveedores() {
  return api<ExpenseProveedor[]>('/proveedores?active=true');
}
