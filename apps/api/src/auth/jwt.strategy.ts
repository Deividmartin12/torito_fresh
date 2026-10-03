import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { obtenerClaveJwt } from './jwt-config';
import { permisosEnUnidad } from './permisos-unidad';

interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // El vencimiento lo controla el propio token (`exp`), que passport ya valida acá.
      // Antes había además un chequeo manual de "6 horas" que duplicaba esta regla.
      ignoreExpiration: false,
      secretOrKey: obtenerClaveJwt(config),
    });
  }

  async validate(payload: JwtPayload) {
    // El rol Y SUS PERMISOS se leen de la base en cada petición (no del token), así que
    // desactivar a un usuario, cambiarle el rol o marcarle un permiso nuevo en el panel tiene
    // efecto inmediato, sin volver a iniciar sesión y sin esperar a que venza el token.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: { include: { permisos: { select: { clave: true } } } },
        trabajador: {
          select: {
            id: true,
            estado: true,
            unidadNegocioId: true,
            unidadNegocio: { select: { controlaInventario: true } },
          },
        },
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario inactivo o inexistente');
    }

    // Un rol desactivado deja a su gente afuera. Es lo que hace que desactivarlo en el panel
    // sirva de algo: si no, seguiría trabajando igual hasta que se le cambie el rol a cada uno.
    if (!user.role.estado) {
      throw new UnauthorizedException(
        `El rol "${user.role.nombre}" está desactivado. Pide al administrador que te asigne otro.`,
      );
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role.clave,
      rolNombre: user.administradorPrincipal ? 'Administrador principal' : user.role.nombre,
      administradorPrincipal: user.administradorPrincipal,
      ...permisosEnUnidad(
        user.role,
        user.trabajador?.unidadNegocio.controlaInventario,
        user.administradorPrincipal,
      ),
      controlaInventario: user.trabajador?.unidadNegocio.controlaInventario ?? null,
      // Un trabajador dado de baja cuenta como "sin vincular": no debe poder seguir operando.
      trabajadorId: user.trabajador?.estado ? user.trabajador.id.toString() : null,
      // La unidad viaja con el trabajador: es la persona la que pertenece a un puesto, no
      // la credencial. Sin trabajador activo, una cuenta limitada no tiene alcance.
      unidadNegocioId: user.trabajador?.estado ? user.trabajador.unidadNegocioId.toString() : null,
    };
  }
}
