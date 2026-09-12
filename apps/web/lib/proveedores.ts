import { api } from './api';

/** Forma que devuelve el API para un proveedor (ver `proveedores.service.ts` → `view()`). */
export type Proveedor = {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  telefono: string;
  correo: string;
  direccion: string;
  estado: boolean;
};

export type ProveedorPayload = Pick<
  Proveedor,
  'ruc' | 'razonSocial' | 'nombreComercial' | 'telefono' | 'correo' | 'direccion'
>;

export function getProveedores() {
  return api<Proveedor[]>('/proveedores');
}

export function createProveedor(payload: ProveedorPayload) {
  return api<Proveedor>('/proveedores', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateProveedor(
  id: string,
  payload: Partial<ProveedorPayload> & { estado?: boolean },
) {
  return api<Proveedor>(`/proveedores/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
