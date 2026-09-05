import { api } from './api';

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
  registradoPor: string | null;
};

export type CreateExpensePayload = Pick<Expense, 'fecha' | 'concepto' | 'categoria' | 'monto'> & {
  comprobante?: string;
  observaciones?: string;
  proveedorId?: string;
};

export type ExpenseCategory = { id: string; nombre: string };
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
