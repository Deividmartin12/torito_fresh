import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

/** Mismo costo de hash que usa el login (`AuthService`). */
const BCRYPT_ROUNDS = 10;

/**
 * Cuentas de acceso. Hasta ahora solo las creaba el seed, así que un trabajador nuevo no
 * podía entrar al sistema y sus ventas terminaban atribuidas a otro. Acá se administran
 * desde la app, y el vínculo con el trabajador se escribe en `TrabajadoresService`.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Con `soloDisponibles` devuelve las cuentas que todavía no tienen trabajador. */
  async list(soloDisponibles?: string) {
    const rows = await this.prisma.user.findMany({
      where: soloDisponibles === 'true' ? { trabajador: null } : undefined,
      orderBy: { name: 'asc' },
      include: { role: true, trabajador: true },
    });
    return rows.map((row) => this.view(row));
  }

  async create(dto: CreateUserDto) {
    const role = await this.roleId(dto.role);
    try {
      const row = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          username: dto.username.trim().toLowerCase(),
          passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
          active: dto.active ?? true,
          roleId: role,
        },
        include: { role: true, trabajador: true },
      });
      return this.view(row);
    } catch (error) {
      throw this.traducirError(error);
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Usuario no encontrado');

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.username !== undefined) data.username = dto.username.trim().toLowerCase();
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    if (dto.role !== undefined) data.role = { connect: { id: await this.roleId(dto.role) } };

    try {
      const row = await this.prisma.user.update({
        where: { id },
        data,
        include: { role: true, trabajador: true },
      });
      return this.view(row);
    } catch (error) {
      throw this.traducirError(error);
    }
  }

  /** Los roles existen como filas creadas por el seed; acá se resuelve el id por nombre. */
  private async roleId(name: RoleName) {
    const role = await this.prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    return role.id;
  }

  private traducirError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const campos = (error.meta?.target as string[] | undefined) ?? [];
      if (campos.includes('username'))
        return new ConflictException('Ya existe un usuario con ese nombre de usuario');
      if (campos.includes('email')) return new ConflictException('Ya existe un usuario con ese correo');
      return new ConflictException('Ya existe un usuario con esos datos');
    }
    return error;
  }

  private view(row: any) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      username: row.username,
      role: row.role.name as RoleName,
      active: row.active,
      trabajadorId: row.trabajador?.id?.toString() ?? null,
      trabajador: row.trabajador
        ? `${row.trabajador.nombres} ${row.trabajador.apellidos}`
        : null,
    };
  }
}
