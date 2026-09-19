import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * La unidad de negocio que pide la petición, vía `?unidadNegocioId=`.
 *
 * Existe para no repetir `@Query('unidadNegocioId') unidad?: string` en la veintena de
 * handlers que ahora filtran por unidad. El valor es solo una intención: quién puede pedir
 * qué lo decide `resolverAlcanceUnidad` en el servicio, nunca el controlador.
 *
 * Admite el valor especial `todas` (ver `UNIDAD_TODAS`), reservado para el ADMIN.
 */
export const UnidadQuery = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const valor = request.query?.unidadNegocioId;
    return typeof valor === 'string' ? valor : undefined;
  },
);
