import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret',
    });
  }

  async validate(payload: JwtPayload) {
    const issuedAt = payload.iat ? payload.iat * 1000 : 0;
    if (!issuedAt || Date.now() >= issuedAt + 6 * 60 * 60 * 1000) {
      throw new UnauthorizedException('La sesión ha vencido');
    }
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
