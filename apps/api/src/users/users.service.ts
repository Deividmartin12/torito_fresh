import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

/** Mismo costo de hash que usa el login (`AuthService`). */
const BCRYPT_ROUNDS = 10;

/**
 * Cliente de base sobre el que corre la operación. Normalmente es el de siempre, pero
 * cuando el alta viene de `TrabajadoresService` llega el cliente de la transacción: la
 * cuenta y el trabajador tienen que guardarse —o deshacerse— juntos.
 */
export type DbClient = Prisma.TransactionClient;

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

  /** Los roles activos, para el combo del formulario de trabajador. */
  async rolesAsignables() {
    const roles = await this.prisma.role.findMany({
      where: { estado: true },
      orderBy: [{ sistema: 'desc' }, { nombre: 'asc' }],
      select: { clave: true, nombre: true, descripcion: true },
    });
    return roles.map((rol) => ({
      clave: rol.clave,
      nombre: rol.nombre,
      descripcion: rol.descripcion,
    }));
  }

  async create(dto: CreateUserDto, db: DbClient = this.prisma) {
    const role = await this.roleId(dto.role, db);
    try {
      const row = await db.user.create({
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

  async update(id: string, dto: UpdateUserDto, db: DbClient = this.prisma) {
    const current = await db.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Usuario no encontrado');

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.username !== undefined) data.username = dto.username.trim().toLowerCase();
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    if (dto.role !== undefined) data.role = { connect: { id: await this.roleId(dto.role, db) } };

    try {
      const row = await db.user.update({
        where: { id },
        data,
        include: { role: true, trabajador: true },
      });
      return this.view(row);
    } catch (error) {
      throw this.traducirError(error);
    }
  }

  /**
   * Id del rol a partir de su clave.
   *
   * Antes esto era un `upsert`: si la clave no existía, se creaba el rol en el momento. Ya no
   * corresponde, porque un rol ahora lleva nombre, descripción y permisos, y uno creado así
   * nacería sin ninguno —la persona entraría a un sistema donde no puede hacer nada y sin
   * ningún mensaje que lo explique—. Los roles se crean en Configuración › Roles y permisos.
   */
  private async roleId(clave: string, db: DbClient = this.prisma) {
    const role = await db.role.findUnique({
      where: { clave },
      select: { id: true, estado: true, nombre: true },
    });
    if (!role) throw new BadRequestException('El rol seleccionado no existe');
    if (!role.estado) {
      throw new BadRequestException(
        `El rol "${role.nombre}" está desactivado: no se le puede asignar a nadie`,
      );
    }
    return role.id;
  }

  private traducirError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const campos = (error.meta?.target as string[] | undefined) ?? [];
      if (campos.includes('username'))
        return new ConflictException('Ya existe un usuario con ese nombre de usuario');
      if (campos.includes('email'))
        return new ConflictException('Ya existe un usuario con ese correo');
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
      role: row.role.clave as string,
      rolNombre: row.role.nombre as string,
      active: row.active,
      trabajadorId: row.trabajador?.id?.toString() ?? null,
      trabajador: row.trabajador ? `${row.trabajador.nombres} ${row.trabajador.apellidos}` : null,
    };
  }
}
