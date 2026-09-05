import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTrabajadorDto, UpdateTrabajadorDto } from './trabajadores.dto';

@Injectable()
export class TrabajadoresService {
  constructor(private readonly prisma: PrismaService) {}

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
    });
    return rows.map((row) => this.view(row));
  }

  async get(id: string) {
    return this.view(await this.find(id));
  }

  async create(dto: CreateTrabajadorDto) {
    try {
      const created = await this.prisma.trabajador.create({ data: this.createData(dto) });
      return this.view(created);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateTrabajadorDto) {
    await this.find(id);
    try {
      const updated = await this.prisma.trabajador.update({
        where: { id: BigInt(id) },
        data: this.updateData(dto),
      });
      return this.view(updated);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private async find(id: string) {
    let trabajadorId: bigint;
    try {
      trabajadorId = BigInt(id);
    } catch {
      throw new NotFoundException('Trabajador no encontrado');
    }
    const row = await this.prisma.trabajador.findUnique({ where: { id: trabajadorId } });
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

  private view(row: Prisma.TrabajadorGetPayload<Record<string, never>>) {
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
    };
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ya existe un trabajador con ese número de documento');
    }
    throw error;
  }
}
