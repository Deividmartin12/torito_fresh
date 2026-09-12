import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { AuthUser } from './auth-user';

/**
 * Quién registró cada operación.
 *
 * Antes cada servicio resolvía esto por su cuenta y, si el usuario logueado no tenía un
 * `Trabajador` vinculado, caía al primer trabajador activo por id. Como la pantalla de
 * trabajadores nunca vinculaba cuentas, ese fallback se disparaba casi siempre y todas las
 * ventas y gastos terminaban atribuidos a la misma persona. Acá no hay fallback: si la
 * cuenta no está vinculada, la operación falla y lo dice.
 */

export const SIN_TRABAJADOR_VINCULADO =
  'Tu cuenta no está vinculada a un trabajador activo. Pide al administrador que la vincule desde Configuración › Trabajadores.';

/** Acepta tanto `PrismaService` como el `tx` de una transacción. */
type ClienteTrabajador = {
  trabajador: { findFirst: Prisma.TrabajadorDelegate['findFirst'] };
};

/** Trabajador activo del usuario logueado, o `null` si no tiene ninguno vinculado. */
export async function buscarTrabajadorId(
  db: ClienteTrabajador,
  userId?: string | null,
): Promise<bigint | null> {
  if (!userId) return null;
  const trabajador = await db.trabajador.findFirst({
    where: { userId, estado: true },
    select: { id: true },
  });
  return trabajador?.id ?? null;
}

/** Igual que `buscarTrabajadorId`, pero falla con un mensaje claro en vez de devolver null. */
export async function exigirTrabajadorId(
  db: ClienteTrabajador,
  userId?: string | null,
): Promise<bigint> {
  const trabajadorId = await buscarTrabajadorId(db, userId);
  if (!trabajadorId) throw new BadRequestException(SIN_TRABAJADOR_VINCULADO);
  return trabajadorId;
}

/**
 * Autoría de una operación, con la atribución opcional del admin.
 *
 * - Sin `trabajadorIdSolicitado`: el trabajador del propio usuario.
 * - Con él y rol distinto de ADMIN: 403, nadie registra a nombre de otro.
 * - Con él y rol ADMIN: se valida que exista y esté activo.
 */
export async function resolverTrabajadorAutor(
  db: ClienteTrabajador,
  actor: Pick<AuthUser, 'userId' | 'role'>,
  trabajadorIdSolicitado?: string | number | null,
): Promise<bigint> {
  const solicitado = trabajadorIdSolicitado?.toString().trim();
  if (!solicitado) return exigirTrabajadorId(db, actor.userId);

  if (actor.role !== RoleName.ADMIN) {
    throw new ForbiddenException('Solo un administrador puede registrar a nombre de otro trabajador');
  }

  let id: bigint;
  try {
    id = BigInt(solicitado);
  } catch {
    throw new BadRequestException('El trabajador seleccionado no es válido');
  }

  const trabajador = await db.trabajador.findFirst({
    where: { id, estado: true },
    select: { id: true },
  });
  if (!trabajador) {
    throw new BadRequestException('El trabajador seleccionado no existe o está inactivo');
  }
  return trabajador.id;
}
