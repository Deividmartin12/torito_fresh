/**
 * Qué ve y qué puede hacer la persona que está usando la app.
 *
 * Antes acá vivían dos mapas escritos a mano —`RUTAS_POR_ROL` y `ACCIONES`— que había que
 * mantener en espejo con los `@Roles` del API. Cada vez que se tocaba un permiso de un lado
 * y no del otro, el usuario veía un botón que al guardar respondía "Forbidden resource".
 *
 * Ahora los permisos los manda el API: vienen en la sesión (`/auth/login` y `/auth/me`) como
 * una lista de claves, y acá solo queda traducirlos a pantallas del menú. Los roles ya no se
 * nombran en este archivo: un rol creado desde Configuración › Roles y permisos funciona sin
 * tocar nada de esto, que es justamente lo que antes no se podía.
 */

/**
 * Qué permiso hace falta para entrar a cada pantalla.
 *
 * Es el único mapa que queda, y vive acá porque las rutas son cosa de la web: el API no sabe
 * ni tiene por qué saber cómo se llaman sus pantallas. La clave es el prefijo de la ruta y el
 * valor, la clave del permiso del catálogo (`apps/api/src/auth/permisos.ts`).
 */
const PERMISO_POR_RUTA: Record<string, string> = {
  '/dashboard': 'dashboard.ver',
  '/gastos': 'gastos.ver',
  '/categorias-gastos': 'gastos.categorias.editar',
  '/proveedores': 'proveedores.ver',
  '/produccion': 'produccion.gestionar',
  '/lotes': 'lotes.ver',
  '/clientes': 'clientes.ver',
  '/ventas': 'ventas.ver',
  '/recargas': 'recargas.ver',
  '/devoluciones': 'devoluciones.ver',
  '/envases': 'envases.ver',
  '/bidones-rotos': 'bidonesRotos.ver',
  '/productos': 'productos.ver',
  '/almacenes': 'almacenes.ver',
  '/movimientos': 'kardex.ver',
  '/cobranzas': 'cobranzas.registrar',
  '/cuentas-cobrar': 'cobranzas.registrar',
  '/metodos-pago': 'metodosPago.administrar',
  '/reportes/resumen': 'reportes.ver',
  '/reportes/ventas': 'reportes.ver',
  '/reportes/gastos': 'reportes.ver',
  '/reportes/stock': 'reportes.ver',
  '/reportes/trabajadores': 'reportes.trabajadores',
  '/trabajadores': 'trabajadores.administrar',
  '/unidades-negocio': 'unidades.administrar',
  '/unidades-visibles': 'unidades.elegir',
  '/roles': 'roles.administrar',
};

/**
 * Las rutas ordenadas de la más específica a la más general.
 *
 * El orden importa: `/reportes/trabajadores` tiene que ganarle a `/reportes`, porque si no
 * un rol que puede ver los reportes del negocio entraría también al de desempeño ajeno.
 */
const RUTAS_ORDENADAS = Object.keys(PERMISO_POR_RUTA).sort(
  (izquierda, derecha) => derecha.length - izquierda.length,
);

/** El permiso que pide una pantalla, o `null` si no pide ninguno. */
function permisoDeRuta(href: string): string | null {
  const ruta = RUTAS_ORDENADAS.find(
    (prefijo) => href === prefijo || href.startsWith(`${prefijo}/`),
  );
  return ruta ? PERMISO_POR_RUTA[ruta] : null;
}

/** Si esta persona tiene el permiso. */
export function puede(permisos: string[] | null | undefined, clave: string): boolean {
  return !!permisos?.includes(clave);
}

/**
 * Pantallas que sencillamente no existen en una unidad que no lleva inventario.
 *
 * Es una pregunta distinta de la del permiso, y por eso va en su propio mapa: no es "esta
 * persona no puede", es "acá no hay tal cosa". Un puesto que solo registra ventas y gastos no
 * produce, no tiene lotes, no tiene almacenes que administrar y su kardex está vacío por
 * definición.
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
 *
 * Con `permisos` en `null` —el primer render, antes de leer la sesión— devuelve `false`: la
 * pantalla muestra su "Cargando..." en vez de parpadear con el menú completo.
 */
export function puedeVer(
  permisos: string[] | null | undefined,
  href: string,
  unidad?: ContextoUnidad | null,
): boolean {
  if (!aplicaAUnidad(href, unidad)) return false;
  const necesario = permisoDeRuta(href);
  if (!necesario) return true;
  return puede(permisos, necesario);
}

/**
 * Renombres de ítem de menú.
 *
 * Quien solo puede mirar el catálogo ve "Productos disponibles": la pantalla le sirve para
 * saber qué vender y a qué precio, no para administrar el catálogo, y el nombre lo dice.
 */
export function aliasRuta(permisos: string[] | null | undefined, href: string): string | null {
  if (href === '/productos' && !puede(permisos, 'productos.editar')) {
    return 'Productos disponibles';
  }
  return null;
}
