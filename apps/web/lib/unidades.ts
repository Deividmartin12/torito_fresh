import { api } from './api';

export type UnidadNegocio = {
  id: string;
  codigo: string;
  nombre: string;
  principal: boolean;
  estado: boolean;
  /** En false es un puesto que solo registra sus ventas y sus gastos, sin stock ni kardex. */
  controlaInventario: boolean;
  ventas: number;
  gastos: number;
  clientes: number;
  almacenes: number;
};

/** Lo mínimo para llenar el selector: no trae los conteos. */
export type UnidadOpcion = {
  id: string;
  codigo: string;
  nombre: string;
  principal: boolean;
  controlaInventario: boolean;
};

/**
 * Las unidades que el usuario eligió mirar, en Configuración › Unidades que veo.
 *
 * `todas: true` significa que no eligió ninguna en particular, y no es lo mismo que tenerlas
 * todas marcadas: incluye también las que se creen después.
 */
export type UnidadesVisibles = {
  todas: boolean;
  /** Ids elegidos. Vacío cuando `todas` es true. */
  unidades: string[];
  disponibles: UnidadOpcion[];
};

export function getUnidadesVisibles() {
  return api<UnidadesVisibles>('/unidades/visibles');
}

/** Lista vacía = todas. La preferencia vive en la base, así que sigue a la persona. */
export function guardarUnidadesVisibles(unidades: string[]) {
  return api<UnidadesVisibles>('/unidades/visibles', {
    method: 'PUT',
    body: JSON.stringify({ unidades }),
  });
}

export function getUnidades() {
  return api<UnidadNegocio[]>('/unidades');
}

/** Las unidades que este usuario puede elegir. El admin las ve todas; el resto, solo la suya. */
export function getMisUnidades() {
  return api<UnidadOpcion[]>('/unidades/mias');
}

export function createUnidad(payload: {
  nombre: string;
  controlaInventario?: boolean;
  crearAlmacen?: boolean;
}) {
  return api<UnidadNegocio>('/unidades', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateUnidad(
  id: string,
  payload: { nombre?: string; estado?: boolean; controlaInventario?: boolean },
) {
  return api<UnidadNegocio>(`/unidades/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
