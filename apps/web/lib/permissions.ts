/**
 * Permisos por rol para el menú y las acciones de la app.
 *
 * Un solo lugar, con dos mapas que responden preguntas distintas:
 *   - `RUTAS_POR_ROL` → qué PANTALLAS se ven.
 *   - `ACCIONES` → qué BOTONES funcionan.
 *
 * Son cosas distintas y hace falta separarlas: la pantalla de gastos es legítima para el
 * responsable de una unidad, pero su botón "+ Agregar trabajador" dispara `POST /trabajadores`,
 * que es solo de ADMIN. Mientras esto se adivinaba caso por caso en cada pantalla, el usuario
 * terminaba viendo "Forbidden resource" al guardar.
 *
 * Los dos mapas son un espejo de los `@Roles` del API. Cada acción lleva su endpoint anotado
 * al lado para que, al tocar un `@Roles`, se encuentre su par con un grep de la ruta. Ojo con
 * Nest: `getAllAndOverride` hace que el `@Roles` de un método REEMPLACE al de la clase, no que
 * se sume, así que al tocar uno hay que releer la lista completa.
 */

export type Role = 'ADMIN' | 'SELLER' | 'DELIVERY' | 'WAREHOUSE' | 'SOCIO';

/**
 * Prefijos de ruta visibles por rol. Solo el ADMIN tiene `null` (sin restricción).
 *
 * Antes SELLER y WAREHOUSE también eran `null`, y eso era justamente la fuente de los
 * "Forbidden resource": el menú les ofrecía pantallas que el API les niega (Almacén entrando a
 * Gastos o a Clientes, Vendedor entrando a Métodos de pago o a Producción). Una pantalla entra
 * en esta lista solo si el rol puede hacer en ella lo que la pantalla sirve para hacer: no
 * alcanza con que pueda leerla.
 */
const RUTAS_POR_ROL: Record<Role, string[] | null> = {
  ADMIN: null,
  // Fuera: producción y métodos de pago (no los permite el API) y trabajadores y unidades de
  // negocio, que son pantallas de gestión y solo el admin puede guardar en ellas.
  SELLER: [
    '/dashboard',
    '/gastos',
    '/categorias-gastos',
    '/proveedores',
    '/lotes',
    '/clientes',
    '/ventas',
    '/recargas',
    '/devoluciones',
    '/envases',
    '/bidones-rotos',
    '/productos',
    '/almacenes',
    '/movimientos',
    '/cobranzas',
    '/reportes',
  ],
  // Almacén no toca dinero: ni gastos, ni cobranzas, ni clientes.
  WAREHOUSE: [
    '/dashboard',
    '/proveedores',
    '/produccion',
    '/lotes',
    '/ventas',
    '/recargas',
    '/devoluciones',
    '/envases',
    '/bidones-rotos',
    '/productos',
    '/almacenes',
    '/movimientos',
    '/reportes',
  ],
  DELIVERY: ['/dashboard', '/ventas', '/clientes', '/envases', '/productos'],
  // El socio lleva su propio negocio: registra ventas y gastos, cobra y maneja sus clientes,
  // sus proveedores y su stock. Fuera quedan el catálogo de productos y lotes, la producción,
  // los almacenes, los métodos de pago, los trabajadores y las unidades de negocio: todo eso
  // es compartido y lo administra la operación principal.
  SOCIO: [
    '/dashboard',
    '/ventas',
    '/clientes',
    '/cobranzas',
    '/devoluciones',
    '/gastos',
    '/proveedores',
    '/envases',
    '/productos',
    '/movimientos',
    '/reportes/resumen',
    '/reportes/ventas',
    '/reportes/gastos',
    '/reportes/stock',
  ],
};

/**
 * Qué puede hacer cada rol, acción por acción, con el endpoint que la respalda.
 *
 * Es lo que deciden los botones de alta y edición —incluidos los "+ Agregar X" dentro de los
 * combos—, para que nadie vea un botón que va a fallar al guardar.
 */
export const ACCIONES = {
  'trabajadores.crear': ['ADMIN'], // POST /trabajadores
  'trabajadores.editar': ['ADMIN'], // PATCH /trabajadores/:id
  'gastos.categoria.crear': ['ADMIN', 'SELLER', 'SOCIO'], // POST /expenses/categories
  // Renombrar o borrar una categoría afecta los gastos de TODAS las unidades, por eso el
  // socio puede crear pero no editar.
  'gastos.categoria.editar': ['ADMIN', 'SELLER'], // PATCH|DELETE /expenses/categories/:id
  'documento.consultar': ['ADMIN', 'SELLER', 'DELIVERY', 'WAREHOUSE', 'SOCIO'], // GET /consulta-documento/*
  'clientes.crear': ['ADMIN', 'SELLER', 'DELIVERY', 'SOCIO'], // POST /clients
  'clientes.editar': ['ADMIN', 'SELLER', 'SOCIO'], // PATCH /clients/:id
  'proveedores.crear': ['ADMIN', 'SELLER', 'WAREHOUSE', 'SOCIO'], // POST /proveedores
  'proveedores.editar': ['ADMIN', 'SELLER', 'WAREHOUSE', 'SOCIO'], // PATCH /proveedores/:id
  'almacenes.crear': ['ADMIN', 'SELLER', 'WAREHOUSE'], // POST /operations/warehouses
  'productos.editar': ['ADMIN', 'SELLER', 'WAREHOUSE'], // POST|PATCH|DELETE /operations/products
  'cobranzas.registrar': ['ADMIN', 'SELLER', 'SOCIO'], // POST /operations/accounts/:type/payments
  'envases.ajustar': ['ADMIN', 'WAREHOUSE', 'DELIVERY', 'SOCIO'], // POST /containers/adjust
  'metodosPago.crear': ['ADMIN', 'SELLER', 'WAREHOUSE', 'DELIVERY', 'SOCIO'], // POST /operations/payment-methods
  'metodosPago.administrar': ['ADMIN'], // /payment-methods (clase)
  'unidades.administrar': ['ADMIN'], // /unidades (clase)
  'produccion.registrar': ['ADMIN', 'WAREHOUSE'], // /production (clase)
} as const satisfies Record<string, readonly Role[]>;

export type Accion = keyof typeof ACCIONES;

/** Si este rol puede ejecutar la acción sin que el API se la rechace. */
export function puede(role: string | null | undefined, accion: Accion): boolean {
  return !!role && (ACCIONES[accion] as readonly string[]).includes(role);
}

/**
 * Pantallas que sencillamente no existen en una unidad que no lleva inventario.
 *
 * Es una pregunta distinta de la del rol, y por eso va en su propio mapa: no es "esta persona
 * no puede", es "acá no hay tal cosa". Un puesto que solo registra ventas y gastos no produce,
 * no tiene lotes, no tiene almacenes que administrar y su kardex está vacío por definición.
 *
 * `/productos` NO entra: el puesto necesita el catálogo para elegir qué vende y a qué precio.
 */
const RUTAS_DE_INVENTARIO = [
  '/produccion',
  '/lotes',
  '/almacenes',
  '/movimientos',
  '/reportes/stock',
];

export type ContextoUnidad = { controlaInventario: boolean };

/** Renombres de ítem de menú por rol. */
const ALIAS_POR_ROL: Partial<Record<Role, Record<string, string>>> = {
  DELIVERY: { '/productos': 'Productos disponibles' },
  SOCIO: { '/productos': 'Productos disponibles' },
};

export function rutasPermitidas(role?: string | null): string[] | null {
  if (!role) return null;
  // Un rol desconocido (token viejo, dato corrupto) no debe caer en "ve todo": se le da el
  // permiso más restrictivo que existe.
  if (!(role in RUTAS_POR_ROL)) return RUTAS_POR_ROL.DELIVERY;
  return RUTAS_POR_ROL[role as Role];
}

/** Si la pantalla aplica a esta unidad. Sin unidad (o con una que lleva stock) aplica todo. */
export function aplicaAUnidad(href: string, unidad?: ContextoUnidad | null): boolean {
  if (!unidad || unidad.controlaInventario) return true;
  return !RUTAS_DE_INVENTARIO.some((ruta) => href === ruta || href.startsWith(`${ruta}/`));
}

/**
 * Si esta persona puede entrar a esta pantalla, en esta unidad.
 *
 * El tercer parámetro es opcional a propósito: así una llamada que se olvide de pasarlo sigue
 * compilando y se comporta como antes, en vez de esconder media app por accidente.
 */
export function puedeVer(
  role: string | null | undefined,
  href: string,
  unidad?: ContextoUnidad | null,
): boolean {
  if (!aplicaAUnidad(href, unidad)) return false;
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

/** Etiquetas legibles para el rol. `GET /users/roles` devuelve el enum crudo. */
export const ETIQUETA_ROL: Record<Role, string> = {
  ADMIN: 'Administrador',
  SELLER: 'Vendedor',
  DELIVERY: 'Repartidor',
  WAREHOUSE: 'Almacén',
  SOCIO: 'Responsable de unidad',
};

export function etiquetaRol(role?: string | null): string {
  if (!role) return '';
  return ETIQUETA_ROL[role as Role] ?? role;
}
