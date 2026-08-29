/**
 * Permisos por rol para el menú y las acciones de la app.
 * Un solo lugar: si un rol no está en `RUTAS_POR_ROL` ve todo (comportamiento actual
 * para ADMIN, SELLER y WAREHOUSE). Solo DELIVERY está restringido.
 */

export type Role = 'ADMIN' | 'SELLER' | 'DELIVERY' | 'WAREHOUSE';

/** Prefijos de ruta visibles por rol. Rol ausente = sin restricción. */
const RUTAS_POR_ROL: Partial<Record<Role, string[]>> = {
  DELIVERY: ['/dashboard', '/ventas', '/clientes', '/envases', '/productos'],
};

/** Renombres de ítem de menú por rol. */
const ALIAS_POR_ROL: Partial<Record<Role, Record<string, string>>> = {
  DELIVERY: { '/productos': 'Productos disponibles' },
};

export function rutasPermitidas(role?: string | null): string[] | null {
  return role ? (RUTAS_POR_ROL[role as Role] ?? null) : null;
}

export function puedeVer(role: string | null | undefined, href: string): boolean {
  const permitidas = rutasPermitidas(role);
  if (!permitidas) return true;
  return permitidas.some((ruta) => href === ruta || href.startsWith(`${ruta}/`));
}

export function aliasRuta(role: string | null | undefined, href: string): string | null {
  return role ? (ALIAS_POR_ROL[role as Role]?.[href] ?? null) : null;
}

/** DELIVERY solo crea y lee: sin editar, borrar, desactivar ni confirmar. */
export function puedeEditar(role?: string | null): boolean {
  return role !== 'DELIVERY';
}
