import { CLAVES_PERMISOS } from './permisos';

// Estas acciones administran información compartida o accesos de otras unidades.
const PERMISOS_GLOBALES = new Set([
  'unidades.elegir',
  'unidades.administrar',
  'roles.administrar',
  'trabajadores.administrar',
  'metodosPago.administrar',
  'productos.editar',
  'lotes.editar',
  'gastos.categorias.editar',
  'proveedores.editar',
]);

// Una cuenta de una unidad sin inventario opera solo su negocio. Incluso un rol con
// acceso total queda limitado: administrar roles, cuentas o catálogos compartidos
// permitiría acceder a otras unidades o modificar sus operaciones indirectamente.
const PERMISOS_UNIDAD_INDEPENDIENTE = new Set([
  'dashboard.ver',
  'documento.consultar',
  'gastos.ver',
  'gastos.registrar',
  'gastos.anular',
  'gastos.categorias.crear',
  'proveedores.ver',
  'proveedores.crear',
  'clientes.ver',
  'clientes.crear',
  'clientes.editar',
  'ventas.ver',
  'ventas.registrar',
  'ventas.editar',
  'ventas.anular',
  'recargas.ver',
  'devoluciones.ver',
  'devoluciones.registrar',
  'envases.ver',
  'envases.ajustar',
  'productos.ver',
  'cobranzas.ver',
  'creditos.excepcion',
  'cargaDiaria.registrar',
  'cobranzas.registrar',
  'metodosPago.ver',
  'metodosPago.crearPropio',
  'reportes.ver',
  'reportes.trabajadores',
  'reportes.reparto',
  'trabajadores.ver',
  'operaciones.atribuir',
]);

/** La misma autorización en login, /auth/me y en cada petición autenticada. */
export function permisosEnUnidad(
  rol: { accesoTotal: boolean; permisos: { clave: string }[] },
  controlaInventario?: boolean | null,
  administradorPrincipal = false,
) {
  if (administradorPrincipal) return { accesoTotal: true, permisos: [...CLAVES_PERMISOS] };
  const permisos = rol.accesoTotal
    ? [...CLAVES_PERMISOS]
    : rol.permisos.map((permiso) => permiso.clave);
  return {
    accesoTotal: false,
    permisos: permisos.filter((permiso) =>
      controlaInventario === false
        ? PERMISOS_UNIDAD_INDEPENDIENTE.has(permiso)
        : !PERMISOS_GLOBALES.has(permiso),
    ),
  };
}
