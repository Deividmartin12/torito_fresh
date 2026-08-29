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
  containerBalance: number;
  active: boolean;
};

export type ClientePayload = {
  name: string;
  phone: string;
  address: string;
  documentType?: string;
  document?: string;
};

export function createCliente(payload: ClientePayload) {
  return api<Cliente>('/clients', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateCliente(id: string, payload: ClientePayload) {
  return api<Cliente>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
