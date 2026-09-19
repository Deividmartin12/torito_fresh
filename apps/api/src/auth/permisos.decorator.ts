import { SetMetadata } from '@nestjs/common';

export const PERMISOS_KEY = 'permisos';

/**
 * Qué permiso hace falta para entrar a este endpoint.
 *
 * Con varios alcanza tener UNO: son alternativas, no requisitos acumulables. Sirve para los
 * endpoints que alimentan a dos pantallas distintas (un combo que usa el que registra y el
 * que administra), y evita tener que inventar un permiso "o lo uno o lo otro".
 *
 * Ojo con Nest: `getAllAndOverride` hace que el decorador del MÉTODO reemplace al de la
 * CLASE, no que se sume. Al tocar uno hay que releer la lista entera del controlador.
 */
export const Permisos = (...permisos: string[]) => SetMetadata(PERMISOS_KEY, permisos);

/**
 * Endpoint abierto a cualquier sesión válida, dentro de un controlador que sí pide permiso.
 *
 * No es lo mismo que `@Public()`, que no pide ni siquiera estar logueado. Es para lo que toda
 * persona necesita sí o sí para que la app funcione —saber en qué unidad está parada—, y que
 * por lo tanto no tiene sentido como permiso: sería uno que hay que acordarse de marcar
 * siempre, y el día que alguien lo olvide el rol queda con la pantalla a medias.
 */
export const SinPermiso = () => SetMetadata(PERMISOS_KEY, []);
