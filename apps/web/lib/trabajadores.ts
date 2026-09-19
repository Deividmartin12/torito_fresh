import { api } from './api';
import { Role } from './permissions';

/** Cuenta con la que el trabajador entra al sistema. Sale del mismo formulario que él. */
export type CuentaTrabajador = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  role: Role;
  active: boolean;
};

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
  /** Unidad de negocio a la que pertenece. Define dónde caen las ventas y gastos que registre. */
  unidadNegocioId: string;
  unidad: string | null;
  userId: string | null;
  usuario: CuentaTrabajador | null;
};

/**
 * Datos del acceso que viajan junto con el trabajador. El nombre y el correo de la cuenta no
 * van acá: el API los toma de `nombres`/`apellidos`/`correo` para que no haya dos versiones
 * del mismo dato. La contraseña solo se manda cuando se está fijando una nueva.
 */
export type CuentaTrabajadorPayload = {
  username: string;
  password?: string;
  role: Role;
};

export type TrabajadorPayload = Pick<
  Trabajador,
  'tipoDocumento' | 'numeroDocumento' | 'nombres' | 'apellidos' | 'telefono' | 'correo' | 'cargo'
> & {
  unidadNegocioId?: string;
  cuenta?: CuentaTrabajadorPayload;
};

/** Se mantiene el nombre anterior porque lo usan los formularios que solo dan de alta. */
export type CreateTrabajadorPayload = TrabajadorPayload;

/** En la edición todo es opcional y además se puede dar de alta o de baja al trabajador. */
export type TrabajadorUpdatePayload = Partial<TrabajadorPayload> & { estado?: boolean };

export const CARGOS_TRABAJADOR = [
  'Administrador',
  'Almacenero',
  'Vendedor',
  'Repartidor',
  'Socio',
] as const;

/** Roles asignables desde la app. Coinciden con el enum `RoleName` del API. */
export const ROLES_CUENTA: Role[] = ['ADMIN', 'SELLER', 'WAREHOUSE', 'DELIVERY', 'SOCIO'];

export const nombreTrabajador = (item: Pick<Trabajador, 'nombres' | 'apellidos'>) =>
  `${item.nombres} ${item.apellidos}`.trim();

export function getTrabajadores(soloActivos = false) {
  return api<Trabajador[]>(`/trabajadores${soloActivos ? '?active=true' : ''}`);
}

export function createTrabajador(payload: TrabajadorPayload) {
  return api<Trabajador>('/trabajadores', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateTrabajador(id: string, payload: TrabajadorUpdatePayload) {
  return api<Trabajador>(`/trabajadores/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
