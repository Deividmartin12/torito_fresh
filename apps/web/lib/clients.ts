import { api } from './api';

export type Cliente = {
  id: string;
  name: string;
  documentType: string | null;
  document: string | null;
  phone: string;
  address: string;
  debtBalance: number;
  pendingReceivables: number;
  overdueBalance: number;
  overdueCount: number;
  /** Tope de crédito. null = sin límite; 0 = no se le vende a crédito. */
  creditLimit: number | null;
  /** Cuánto más se le puede fiar hoy. null = sin límite. */
  creditAvailable: number | null;
  containerBalance: number;
  active: boolean;
};

export type ClientePayload = {
  name: string;
  phone: string;
  address: string;
  documentType?: string;
  document?: string;
  /**
   * Tope de crédito. Mandar null lo deja sin límite; 0 significa que no se le vende a
   * crédito. No mandarlo (undefined) deja el que ya tenía.
   */
  creditLimit?: number | null;
};

export function createCliente(payload: ClientePayload) {
  return api<Cliente>('/clients', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateCliente(id: string, payload: ClientePayload) {
  return api<Cliente>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
