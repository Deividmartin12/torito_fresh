import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

/** Los mismos nombres que muestra la web, para que el error se pueda reportar tal cual. */
const ETIQUETA_ROL: Record<RoleName, string> = {
  ADMIN: 'Administrador',
  SELLER: 'Vendedor',
  DELIVERY: 'Repartidor',
  WAREHOUSE: 'Almacén',
  SOCIO: 'Responsable de unidad',
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const roles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (user && roles.includes(user.role)) return true;

    // Devolver `false` deja que Nest responda su "Forbidden resource" genérico, que el front
    // muestra tal cual y no le dice nada a nadie. Este mensaje nombra el rol y la acción, así
    // que un permiso mal puesto se puede reportar y encontrar sin abrir la consola.
    const rol = user ? ETIQUETA_ROL[user.role] : 'sin rol';
    const accion = `${request.method} ${request.url?.split('?')[0] ?? ''}`.trim();
    throw new ForbiddenException(`Tu rol (${rol}) no tiene permiso para esta acción: ${accion}`);
  }
}
