import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { obtenerClaveJwt } from './jwt-config';

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
    // El rol se lee de la base en cada petición (no del token), así que desactivar a un
    // usuario o cambiarle el rol tiene efecto inmediato sin volver a iniciar sesión.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario inactivo o inexistente');
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
    };
  }
}
