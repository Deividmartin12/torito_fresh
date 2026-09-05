import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    // dto.email admite tanto el nombre de usuario como el correo.
    const identifier = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
      include: { role: true },
    });

    // El mismo mensaje para "no existe", "está inactivo" y "contraseña mala": así nadie puede
    // averiguar qué usuarios existen probando correos.
    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role.name,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role.name,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        active: true,
        role: { select: { name: true } },
      },
    });
    // Si el usuario ya no existe, respondemos 401 en vez de un `null` con estado 200: así el
    // cliente sabe que debe volver a iniciar sesión en lugar de romperse leyendo `user.role`.
    if (!user) throw new UnauthorizedException('La sesión ya no es válida');
    return user;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const validPassword = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!validPassword) {
      // A propósito NO es un 401: la web interpreta cualquier 401 como "sesión vencida" y
      // te manda al login. Equivocarse al escribir la contraseña actual no debe sacarte.
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Contraseña actualizada' };
  }
}
