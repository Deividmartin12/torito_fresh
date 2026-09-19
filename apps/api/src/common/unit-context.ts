import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, tienePermiso } from './auth-user';
import { SIN_TRABAJADOR_VINCULADO } from './worker-context';

/**
 * A qué unidad de negocio pertenece cada operación.
 *
 * La app dejó de ser un solo negocio: la operación principal y cada puesto satélite llevan
 * sus ventas, gastos, clientes y almacenes por separado. Este archivo es el único lugar
 * donde se decide qué unidad ve una petición y a qué unidad escribe, para que los servicios
 * no repitan el mismo ternario en cada `where`.
 *
 * Hermano de `worker-context.ts`: mismo estilo (funciones sueltas, `db` acepta tanto
 * `PrismaService` como el `tx` de una transacción) y mismos mensajes en español.
 */

/** Valor del parámetro `unidadNegocioId` para pedir todas las unidades juntas. */
export const UNIDAD_TODAS = 'todas';

/**
 * Qué unidades alcanza una lectura.
 *
 * `varias` es lo que hace falta cuando alguien tiene marcadas dos de sus tres unidades en
 * Configuración: no es ni una ni todas. `todas` no es lo mismo que marcarlas una por una,
 * porque incluye también las que se creen mañana.
 */
export type AlcanceUnidad =
  { tipo: 'todas' } | { tipo: 'una'; id: bigint } | { tipo: 'varias'; ids: bigint[] };

type ClienteUnidad = {
  unidadNegocio: { findFirst: Prisma.UnidadNegocioDelegate['findFirst'] };
};

type ClientePreferencia = {
  usuarioUnidadVisible: { findMany: Prisma.UsuarioUnidadVisibleDelegate['findMany'] };
};

type ClienteTrabajador = {
  trabajador: { findFirst: Prisma.TrabajadorDelegate['findFirst'] };
};

/**
 * Lo que hace falta saber del actor para resolver su alcance.
 *
 * Lleva `accesoTotal` y `permisos` porque quién puede pararse en OTRA unidad ya no se deduce
 * del rol sino del permiso `unidades.elegir`. Mientras era `role !== 'ADMIN'`, un rol creado
 * desde el panel quedaba siempre encerrado en su propia unidad aunque se le marcara todo.
 */
type ActorUnidad = Pick<AuthUser, 'accesoTotal' | 'permisos' | 'unidadNegocioId' | 'userId'>;

/**
 * Id de la unidad Principal. Se cachea en memoria porque es una fila que se crea en la
 * migración y no cambia nunca: pedirla en cada petición sería una consulta desperdiciada.
 */
let principalCacheada: bigint | null = null;

export async function unidadPrincipalId(db: ClienteUnidad): Promise<bigint> {
  if (principalCacheada !== null) return principalCacheada;
  const principal = await db.unidadNegocio.findFirst({
    where: { principal: true },
    select: { id: true },
  });
  if (!principal) {
    throw new BadRequestException(
      'No existe la unidad de negocio principal. Ejecuta el seed de la base de datos.',
    );
  }
  principalCacheada = principal.id;
  return principal.id;
}

/**
 * Si la unidad lleva stock, o si es un puesto que solo registra ventas y gastos.
 *
 * En false sus ventas no descuentan inventario ni generan kardex, y sus devoluciones no
 * reingresan nada. Es lo que le permite vender a un puesto que no produce: el stock solo nace
 * de una orden de producción, así que sin esto la venta fallaba con "Stock insuficiente".
 *
 * A diferencia de `unidadPrincipalId` no se cachea: este valor sí puede cambiar, y es una
 * lectura por clave primaria dentro de una transacción que ya hace otras diez. Ante la duda
 * devuelve `true`, que es el comportamiento de siempre.
 */
export async function unidadControlaInventario(
  db: ClienteUnidad,
  unidadId: bigint,
): Promise<boolean> {
  const fila = await db.unidadNegocio.findFirst({
    where: { id: unidadId },
    select: { controlaInventario: true },
  });
  return fila?.controlaInventario ?? true;
}

/**
 * A qué unidad se ESCRIBE una operación.
 *
 * Manda la unidad ACTIVA —la que el usuario tiene elegida y viaja en `?unidadNegocioId=`—,
 * no la del trabajador que la teclea. Antes salía del autor, y por eso un administrador
 * parado en un puesto satélite registraba un gasto que se guardaba en la Principal: el gasto
 * desaparecía de la lista que estaba mirando y engordaba los números de otra unidad, sin
 * ningún aviso. "Dónde se registra" y "quién lo registró" son dos ejes distintos.
 *
 * `atribuidaA` es el segundo eje, y solo se valida cuando la operación se le adjudica a OTRA
 * persona (`dto.trabajadorId`, que pide el permiso `operaciones.atribuir`): ahí sí tiene que ser de la
 * unidad destino, porque si no su reporte por trabajador mostraría ventas de un puesto al que
 * no pertenece. El trabajador del propio actor no se valida: es el autor, no el dueño.
 */
export async function resolverUnidadDeEscritura(
  db: ClienteUnidad & ClienteTrabajador & ClientePreferencia,
  intencion: {
    actor: ActorUnidad;
    unidadSolicitada?: string | null;
    atribuidaA?: bigint | null;
  },
): Promise<bigint> {
  const unidad = await unidadDestino(db, intencion.actor, intencion.unidadSolicitada);
  if (intencion.atribuidaA != null) {
    const autor = await db.trabajador.findFirst({
      where: { id: intencion.atribuidaA },
      select: { unidadNegocioId: true },
    });
    if (!autor) throw new BadRequestException('El trabajador de la operación ya no existe');
    if (autor.unidadNegocioId !== unidad) {
      throw new BadRequestException(
        'El trabajador seleccionado pertenece a otra unidad de negocio',
      );
    }
  }
  return unidad;
}

async function unidadDestino(
  db: ClienteUnidad & ClientePreferencia,
  actor: ActorUnidad,
  unidadSolicitada?: string | null,
): Promise<bigint> {
  const solicitada = unidadSolicitada?.toString().trim();
  const propia = actor.unidadNegocioId ? BigInt(actor.unidadNegocioId) : null;

  if (!tienePermiso(actor, 'unidades.elegir')) {
    if (!propia) throw new ForbiddenException(SIN_TRABAJADOR_VINCULADO);
    return propia;
  }

  // Sin unidad pedida manda lo que tenga elegido en Configuración: si está
  // mirando un solo puesto, ahí registra. Con varias o con todas no hay un destino único, así
  // que cae a la suya; el formulario avisa en cuál va a quedar antes de guardar.
  if (!solicitada) {
    const guardado = await alcanceGuardado(db, actor.userId);
    if (guardado.tipo === 'una') return unidadActivaOFalla(db, guardado.id);
    return propia ?? unidadPrincipalId(db);
  }

  // "Todo consolidado" es una lente para MIRAR, no un destino donde registrar.
  if (solicitada === UNIDAD_TODAS) return propia ?? unidadPrincipalId(db);

  let id: bigint;
  try {
    id = BigInt(solicitada);
  } catch {
    throw new BadRequestException('La unidad de negocio seleccionada no es válida');
  }
  return unidadActivaOFalla(db, id);
}

/**
 * Acá sí se exige `estado: true`, al revés que en la lectura: mirar el histórico de una unidad
 * cerrada es legítimo, seguir registrando en ella no.
 */
async function unidadActivaOFalla(db: ClienteUnidad, id: bigint): Promise<bigint> {
  const unidad = await db.unidadNegocio.findFirst({
    where: { id, estado: true },
    select: { id: true },
  });
  if (!unidad) {
    throw new BadRequestException('La unidad de negocio seleccionada no existe o está inactiva');
  }
  return unidad.id;
}

/**
 * Las unidades que este usuario eligió mirar, en Configuración › Unidades que veo.
 *
 * Sin filas guardadas devuelve `todas`, que es el estado por defecto de toda cuenta: así una
 * unidad creada después queda incluida sola, en vez de faltar sin que nadie se entere.
 */
export async function alcanceGuardado(
  db: ClientePreferencia,
  userId: string,
): Promise<AlcanceUnidad> {
  const filas = await db.usuarioUnidadVisible.findMany({
    where: { userId },
    select: { unidadNegocioId: true },
  });
  if (!filas.length) return { tipo: 'todas' };
  if (filas.length === 1) return { tipo: 'una', id: filas[0].unidadNegocioId };
  return { tipo: 'varias', ids: filas.map((fila) => fila.unidadNegocioId) };
}

/**
 * Qué unidades puede LEER el actor.
 *
 * - Sin el permiso `unidades.elegir`: siempre la suya, se pida lo que se pida.
 * - Con el permiso y sin parámetro: lo que tenga guardado en Configuración (sin nada, todas).
 * - Con el permiso y `todas`: sin filtro, el consolidado.
 * - Con el permiso y un id: se valida que la unidad exista.
 *
 * El parámetro sigue existiendo para las pantallas que necesitan mirar una unidad concreta sin
 * cambiarle la preferencia a nadie; la elección de fondo vive en la base.
 */
export async function resolverAlcanceUnidad(
  db: ClienteUnidad & ClientePreferencia,
  actor: ActorUnidad,
  unidadSolicitada?: string | null,
): Promise<AlcanceUnidad> {
  const solicitada = unidadSolicitada?.toString().trim();

  if (!tienePermiso(actor, 'unidades.elegir')) {
    // Se IGNORA lo pedido en vez de rechazarlo: quien no elige unidad no la elige, y
    // un parámetro suelto solo puede venir de una pantalla que lo arrastró. Devolver la suya
    // no filtra nada, es el mismo valor que ya correspondía.
    if (!actor.unidadNegocioId) throw new ForbiddenException(SIN_TRABAJADOR_VINCULADO);
    return { tipo: 'una', id: BigInt(actor.unidadNegocioId) };
  }

  if (solicitada === UNIDAD_TODAS) return { tipo: 'todas' };
  if (!solicitada) return alcanceGuardado(db, actor.userId);

  let id: bigint;
  try {
    id = BigInt(solicitada);
  } catch {
    throw new BadRequestException('La unidad de negocio seleccionada no es válida');
  }
  // Sin exigir `estado: true`: mirar el histórico de una unidad cerrada es legítimo. Lo que
  // no se puede es seguir registrando en ella, y de eso se ocupa `resolverUnidadDeEscritura`.
  const unidad = await db.unidadNegocio.findFirst({ where: { id }, select: { id: true } });
  if (!unidad) throw new BadRequestException('La unidad de negocio seleccionada no existe');
  return { tipo: 'una', id: unidad.id };
}

/** El `where` de la columna, según el alcance. `todas` no filtra; `varias` usa un `in`. */
type CondicionUnidad = { unidadNegocioId?: bigint | { in: bigint[] } };

function condicionUnidad(alcance: AlcanceUnidad): CondicionUnidad {
  if (alcance.tipo === 'todas') return {};
  if (alcance.tipo === 'varias') return { unidadNegocioId: { in: alcance.ids } };
  return { unidadNegocioId: alcance.id };
}

/**
 * Fragmento de `where` para las tablas que llevan la columna (venta, gasto, cliente,
 * almacén y trabajador). Se usa con spread: `where: { ...filtroUnidad(alcance), fecha }`.
 * Con alcance "todas" devuelve `{}`, que es justamente "sin filtro".
 */
export function filtroUnidad(alcance: AlcanceUnidad): CondicionUnidad {
  return condicionUnidad(alcance);
}

/**
 * Igual que `filtroUnidad`, pero para las tablas que heredan la unidad por relación:
 * `filtroUnidadPor('cliente', alcance)` → `{ cliente: { unidadNegocioId: 3n } }`.
 */
export function filtroUnidadPor<K extends string>(
  relacion: K,
  alcance: AlcanceUnidad,
): Record<K, CondicionUnidad> | Record<string, never> {
  if (alcance.tipo === 'todas') return {};
  return { [relacion]: condicionUnidad(alcance) } as Record<K, CondicionUnidad>;
}

/** Si el alcance incluye a esta unidad. Sirve para decidir dónde se escribe. */
export function alcanceIncluye(alcance: AlcanceUnidad, unidadId: bigint): boolean {
  if (alcance.tipo === 'todas') return true;
  if (alcance.tipo === 'varias') return alcance.ids.includes(unidadId);
  return alcance.id === unidadId;
}

type ClienteIntegridad = {
  cliente: { findFirst: Prisma.ClienteDelegate['findFirst'] };
  almacen: { findFirst: Prisma.AlmacenDelegate['findFirst'] };
  venta: { findFirst: Prisma.VentaDelegate['findFirst'] };
  cuentaCobrar: { findFirst: Prisma.CuentaCobrarDelegate['findFirst'] };
};

/**
 * Falla si alguna entidad referenciada pertenece a otra unidad.
 *
 * Es lo que impide que un puesto satélite descuente el stock del almacén de la Principal o
 * le cobre a un cliente ajeno. Sin esto, el aislamiento solo existiría en las lecturas: las
 * escrituras aceptan ids que vienen del formulario y nada garantiza que sean de su unidad.
 */
export async function exigirMismaUnidad(
  db: ClienteIntegridad,
  unidad: bigint,
  refs: {
    clienteId?: bigint | null;
    almacenId?: bigint | null;
    ventaId?: bigint | null;
    cuentaCobrarId?: bigint | null;
  },
): Promise<void> {
  if (refs.clienteId != null) {
    const fila = await db.cliente.findFirst({
      where: { id: refs.clienteId },
      select: { unidadNegocioId: true },
    });
    if (!fila) throw new BadRequestException('El cliente seleccionado no existe');
    if (fila.unidadNegocioId !== unidad) {
      throw new BadRequestException('El cliente seleccionado es de otra unidad de negocio');
    }
  }

  if (refs.almacenId != null) {
    const fila = await db.almacen.findFirst({
      where: { id: refs.almacenId },
      select: { unidadNegocioId: true },
    });
    if (!fila) throw new BadRequestException('El almacén seleccionado no existe');
    if (fila.unidadNegocioId !== unidad) {
      throw new BadRequestException('El almacén seleccionado es de otra unidad de negocio');
    }
  }

  if (refs.ventaId != null) {
    const fila = await db.venta.findFirst({
      where: { id: refs.ventaId },
      select: { unidadNegocioId: true },
    });
    // 404 y no 403: para quien no puede verla, la venta sencillamente no existe.
    if (!fila || fila.unidadNegocioId !== unidad) {
      throw new NotFoundException('La venta no existe');
    }
  }

  if (refs.cuentaCobrarId != null) {
    const fila = await db.cuentaCobrar.findFirst({
      where: { id: refs.cuentaCobrarId },
      select: { venta: { select: { unidadNegocioId: true } } },
    });
    if (!fila || fila.venta.unidadNegocioId !== unidad) {
      throw new NotFoundException('La cuenta por cobrar no existe');
    }
  }
}
