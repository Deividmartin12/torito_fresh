import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateTrabajadorDto, UpdateTrabajadorDto } from './trabajadores.dto';

/** El trabajador siempre se lee con su cuenta de acceso: la UI muestra ambas cosas juntas. */
const CON_CUENTA = { user: { include: { role: true } } } as const;
type TrabajadorConCuenta = Prisma.TrabajadorGetPayload<{ include: typeof CON_CUENTA }>;

@Injectable()
export class TrabajadoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async list(search?: string, active?: string) {
    const term = search?.trim();
    const rows = await this.prisma.trabajador.findMany({
      where: {
        ...(term
          ? {
              OR: [
                { nombres: { contains: term, mode: 'insensitive' } },
                { apellidos: { contains: term, mode: 'insensitive' } },
                { numeroDocumento: { contains: term } },
                { cargo: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(active === 'true' ? { estado: true } : active === 'false' ? { estado: false } : {}),
      },
      orderBy: { nombres: 'asc' },
      include: CON_CUENTA,
    });
    return rows.map((row) => this.view(row));
  }

  async get(id: string) {
    return this.view(await this.find(id));
  }

  async create(dto: CreateTrabajadorDto) {
    const userId = await this.resolverCuenta(dto);
    try {
      const created = await this.prisma.trabajador.create({
        data: { ...this.createData(dto), ...(userId ? { userId } : {}) },
        include: CON_CUENTA,
      });
      return this.view(created);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateTrabajadorDto) {
    await this.find(id);
    const userId = await this.resolverCuenta(dto);
    try {
      const updated = await this.prisma.trabajador.update({
        where: { id: BigInt(id) },
        data: {
          ...this.updateData(dto),
          // `userId: ''` desvincula; `undefined` deja la cuenta como está.
          ...(userId !== undefined ? { userId } : {}),
        },
        include: CON_CUENTA,
      });
      return this.view(updated);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  /**
   * Resuelve qué cuenta de acceso queda vinculada:
   * - `cuenta` → se crea un usuario nuevo y se devuelve su id
   * - `userId` con valor → se vincula esa cuenta (validando que esté libre)
   * - `userId` vacío → `null`, se desvincula
   * - nada → `undefined`, no se toca
   */
  private async resolverCuenta(dto: {
    userId?: string;
    cuenta?: CreateTrabajadorDto['cuenta'];
  }): Promise<string | null | undefined> {
    if (dto.cuenta) {
      const creada = await this.users.create(dto.cuenta);
      return creada.id;
    }
    if (dto.userId === undefined) return undefined;
    const userId = dto.userId.trim();
    if (!userId) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { trabajador: true },
    });
    if (!user) throw new NotFoundException('La cuenta de acceso no existe');
    return user.id;
  }

  private async find(id: string) {
    let trabajadorId: bigint;
    try {
      trabajadorId = BigInt(id);
    } catch {
      throw new NotFoundException('Trabajador no encontrado');
    }
    const row = await this.prisma.trabajador.findUnique({
      where: { id: trabajadorId },
      include: CON_CUENTA,
    });
    if (!row) throw new NotFoundException('Trabajador no encontrado');
    return row;
  }

  private createData(dto: CreateTrabajadorDto): Prisma.TrabajadorUncheckedCreateInput {
    return {
      tipoDocumento: dto.tipoDocumento.trim(),
      numeroDocumento: dto.numeroDocumento.trim(),
      nombres: dto.nombres.trim(),
      apellidos: dto.apellidos.trim(),
      telefono: this.optional(dto.telefono),
      correo: this.optional(dto.correo)?.toLowerCase() ?? null,
      cargo: dto.cargo,
    };
  }

  private updateData(dto: UpdateTrabajadorDto): Prisma.TrabajadorUncheckedUpdateInput {
    return {
      ...(dto.tipoDocumento !== undefined ? { tipoDocumento: dto.tipoDocumento.trim() } : {}),
      ...(dto.numeroDocumento !== undefined ? { numeroDocumento: dto.numeroDocumento.trim() } : {}),
      ...(dto.nombres !== undefined ? { nombres: dto.nombres.trim() } : {}),
      ...(dto.apellidos !== undefined ? { apellidos: dto.apellidos.trim() } : {}),
      ...(dto.telefono !== undefined ? { telefono: this.optional(dto.telefono) } : {}),
      ...(dto.correo !== undefined ? { correo: this.optional(dto.correo)?.toLowerCase() ?? null } : {}),
      ...(dto.cargo !== undefined ? { cargo: dto.cargo } : {}),
      ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
    };
  }

  private optional(value: string | undefined) {
    return value === undefined ? undefined : value.trim() || null;
  }

  private view(row: TrabajadorConCuenta) {
    return {
      id: row.id.toString(),
      tipoDocumento: row.tipoDocumento,
      numeroDocumento: row.numeroDocumento,
      nombres: row.nombres,
      apellidos: row.apellidos,
      telefono: row.telefono ?? '',
      correo: row.correo ?? '',
      cargo: row.cargo,
      estado: row.estado,
      userId: row.userId,
      usuario: row.user
        ? {
            id: row.user.id,
            username: row.user.username,
            email: row.user.email,
            role: row.user.role.name,
            active: row.user.active,
          }
        : null,
    };
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // `Trabajador` tiene dos columnas únicas: el documento y la cuenta vinculada.
      const campos = (error.meta?.target as string[] | undefined) ?? [];
      if (campos.some((campo) => campo.includes('user_id') || campo.includes('userId'))) {
        throw new ConflictException('Esa cuenta ya está vinculada a otro trabajador');
      }
      throw new ConflictException('Ya existe un trabajador con ese número de documento');
    }
    throw error;
  }
}
