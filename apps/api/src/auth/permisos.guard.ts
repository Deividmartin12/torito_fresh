import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../common/auth-user';
import { CATALOGO_PERMISOS } from './permisos';
import { PERMISOS_KEY } from './permisos.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Etiqueta legible de cada permiso, para poder nombrar en el error el que falta. */
const ETIQUETAS = new Map(
  CATALOGO_PERMISOS.flatMap((grupo) =>
    grupo.permisos.map((permiso) => [permiso.clave, permiso.etiqueta] as const),
  ),
);

@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requeridos = this.reflector.getAllAndOverride<string[]>(PERMISOS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin `@Permisos` alcanza con estar autenticado. Es lo que corresponde para `/auth/me` y
    // para cambiar la propia contraseña: no son capacidades que se repartan por rol.
    if (!requeridos?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (user?.accesoTotal) return true;
    if (user && requeridos.some((permiso) => user.permisos.includes(permiso))) return true;

    // Devolver `false` deja que Nest responda su "Forbidden resource" genérico, que el front
    // muestra tal cual y no le dice nada a nadie. Este mensaje nombra el rol y el permiso que
    // falta, así que se puede ir a Configuración › Roles y permisos y marcarlo, sin abrir la
    // consola ni adivinar cuál era.
    const rol = user?.rolNombre ?? 'sin rol';
    const faltante = ETIQUETAS.get(requeridos[0]) ?? requeridos[0];
    throw new ForbiddenException(
      `Tu rol (${rol}) no tiene el permiso "${faltante}", que es el que pide esta acción.`,
    );
  }
}
