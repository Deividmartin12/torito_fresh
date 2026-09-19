import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto } from './auth.dto';
import { CLAVES_PERMISOS } from './permisos';

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
      include: { role: { include: { permisos: { select: { clave: true } } } } },
    });

    // El mismo mensaje para "no existe", "está inactivo" y "contraseña mala": así nadie puede
    // averiguar qué usuarios existen probando correos.
    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // El rol desactivado sí lleva su propio mensaje: acá la contraseña ya se verificó, la
    // cuenta es suya y no se le revela nada que no sepa. Con el mensaje genérico estaría media
    // hora reescribiendo una contraseña que estaba bien.
    if (!user.role.estado) {
      throw new UnauthorizedException(
        `El rol "${user.role.nombre}" está desactivado. Pide al administrador que te asigne otro.`,
      );
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role.clave,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role.clave,
        rolNombre: user.role.nombre,
        accesoTotal: user.role.accesoTotal,
        permisos: this.permisosDe(user.role),
      },
    };
  }

  /**
   * Los permisos que ejerce un rol. Con `accesoTotal` es el catálogo entero, incluidos los
   * permisos que se agreguen mañana; si no, los que tenga marcados.
   *
   * La web los recibe expandidos a propósito: así una pantalla pregunta siempre lo mismo
   * (`puede('ventas.editar')`) sin tener que acordarse de contemplar el caso del administrador.
   */
  private permisosDe(role: { accesoTotal: boolean; permisos: { clave: string }[] }) {
    if (role.accesoTotal) return [...CLAVES_PERMISOS];
    return role.permisos.map((permiso) => permiso.clave);
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
        role: {
          select: {
            clave: true,
            nombre: true,
            accesoTotal: true,
            permisos: { select: { clave: true } },
          },
        },
        trabajador: {
          select: {
            id: true,
            cargo: true,
            estado: true,
            unidadNegocio: { select: { id: true, nombre: true } },
          },
        },
      },
    });
    // Si el usuario ya no existe, respondemos 401 en vez de un `null` con estado 200: así el
    // cliente sabe que debe volver a iniciar sesión en lugar de romperse leyendo `user.role`.
    if (!user) throw new UnauthorizedException('La sesión ya no es válida');
    const { trabajador, role, ...cuenta } = user;
    const vinculado = trabajador?.estado ? trabajador : null;
    return {
      ...cuenta,
      // El rol va como texto plano, igual que en la respuesta del login: el front guarda las
      // dos en la misma clave de sesión y si tuvieran forma distinta, la pantalla que lo
      // muestra recibiría un objeto donde espera una cadena.
      role: role.clave,
      rolNombre: role.nombre,
      accesoTotal: role.accesoTotal,
      permisos: this.permisosDe(role),
      trabajadorId: vinculado?.id.toString() ?? null,
      // El cargo de la persona, que no es lo mismo que su rol: el rol dice qué puede hacer en
      // el sistema y el cargo cómo se llama su puesto. Al pie del menú se muestran los dos.
      cargo: vinculado?.cargo ?? null,
      unidadNegocioId: vinculado?.unidadNegocio.id.toString() ?? null,
      unidad: vinculado?.unidadNegocio.nombre ?? null,
    };
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
