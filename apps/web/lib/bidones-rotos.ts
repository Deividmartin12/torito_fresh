import { api } from './api';

export type BidonRoto = {
  id: string;
  fecha: string;
  cantidad: number;
  observaciones: string | null;
  registradoPor: string | null;
};

export type CreateBidonRotoPayload = {
  fecha: string;
  cantidad: number;
  observaciones?: string;
};

export function getBidonesRotos(from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return api<BidonRoto[]>(`/bidones-rotos${query.size ? `?${query}` : ''}`);
}

export function createBidonRoto(payload: CreateBidonRotoPayload) {
  return api<BidonRoto>('/bidones-rotos', { method: 'POST', body: JSON.stringify(payload) });
}
