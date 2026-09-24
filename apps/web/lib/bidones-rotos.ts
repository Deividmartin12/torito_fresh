import { api } from './api';

export type BidonRoto = {
  id: string;
  fecha: string;
  cantidad: number;
  observaciones: string | null;
  registradoPor: string | null;
  producto: string | null;
  almacen: string | null;
  /** false = quedó anotada pero no movió el inventario (no había stock, o no se eligió producto). */
  descontado: boolean;
};

/** Lo que devuelve el alta: el registro más el aviso cuando el inventario no se pudo mover. */
export type BidonRotoCreado = BidonRoto & { aviso: string | null };

export type CreateBidonRotoPayload = {
  fecha: string;
  cantidad: number;
  observaciones?: string;
  productoId?: string;
  almacenId?: string;
};

export function getBidonesRotos(from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return api<BidonRoto[]>(`/bidones-rotos${query.size ? `?${query}` : ''}`);
}

export function createBidonRoto(payload: CreateBidonRotoPayload) {
  return api<BidonRotoCreado>('/bidones-rotos', { method: 'POST', body: JSON.stringify(payload) });
}
