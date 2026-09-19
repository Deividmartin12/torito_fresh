import { api } from './api';

/** Un permiso del catálogo, tal como lo describe el API para dibujar las casillas. */
export type PermisoCatalogo = {
  clave: string;
  etiqueta: string;
  descripcion: string;
};

/** Los permisos agrupados igual que el menú lateral, para que el panel se lea como la app. */
export type GrupoPermisos = {
  grupo: string;
  permisos: PermisoCatalogo[];
};

export type Rol = {
  id: string;
  /** Identificador estable. No cambia al renombrar el rol. */
  clave: string;
  nombre: string;
  descripcion: string | null;
  /** Los roles del sistema no se pueden eliminar; sí renombrar y ajustar. */
  sistema: boolean;
  /** Lo puede todo, incluidos los permisos que se agreguen mañana. */
  accesoTotal: boolean;
  estado: boolean;
  permisos: string[];
  usuarios: number;
  usuariosActivos: number;
  /** Las unidades de negocio donde hay gente con este rol. */
  unidades: { id: string; nombre: string }[];
};

export function getRoles() {
  return api<Rol[]>('/roles');
}

export function getCatalogoPermisos() {
  return api<GrupoPermisos[]>('/roles/catalogo');
}

export function createRol(payload: {
  nombre: string;
  descripcion?: string;
  permisos: string[];
  estado?: boolean;
}) {
  return api<Rol>('/roles', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateRol(
  id: string,
  payload: { nombre?: string; descripcion?: string; permisos?: string[]; estado?: boolean },
) {
  return api<Rol>(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteRol(id: string) {
  return api<{ message: string }>(`/roles/${id}`, { method: 'DELETE' });
}

/** Los roles que se le pueden asignar a una cuenta: los activos, con su nombre visible. */
export type RolAsignable = { clave: string; nombre: string; descripcion: string | null };

export function getRolesAsignables() {
  return api<RolAsignable[]>('/users/roles');
}
