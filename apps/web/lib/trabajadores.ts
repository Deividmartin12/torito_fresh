import { api } from './api';

export type Trabajador = {
  id: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  correo: string;
  cargo: string;
  estado: boolean;
};

export type CreateTrabajadorPayload = Pick<
  Trabajador,
  'tipoDocumento' | 'numeroDocumento' | 'nombres' | 'apellidos' | 'telefono' | 'correo' | 'cargo'
>;

export const CARGOS_TRABAJADOR = ['Administrador', 'Almacenero', 'Vendedor', 'Repartidor'] as const;

export const nombreTrabajador = (item: Pick<Trabajador, 'nombres' | 'apellidos'>) =>
  `${item.nombres} ${item.apellidos}`.trim();

export function getTrabajadores(soloActivos = false) {
  return api<Trabajador[]>(`/trabajadores${soloActivos ? '?active=true' : ''}`);
}

export function createTrabajador(payload: CreateTrabajadorPayload) {
  return api<Trabajador>('/trabajadores', { method: 'POST', body: JSON.stringify(payload) });
}
