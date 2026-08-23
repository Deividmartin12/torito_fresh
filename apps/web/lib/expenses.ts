import { api } from "./api";

export type Expense = {
  id: string;
  fecha: string;
  concepto: string;
  categoria: string;
  monto: number;
  comprobante: string | null;
  observaciones: string | null;
  registradoPor: string | null;
};

export type CreateExpensePayload = Pick<Expense, "fecha" | "concepto" | "categoria" | "monto"> & {
  comprobante?: string;
  observaciones?: string;
};

export function getExpenses() { return api<Expense[]>("/expenses"); }
export function createExpense(payload: CreateExpensePayload) { return api<Expense>("/expenses", { method: "POST", body: JSON.stringify(payload) }); }
