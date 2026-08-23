import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProveedorDto, UpdateProveedorDto } from "./proveedores.dto";

const proveedorRelations = {
  compras: { select: { cuentaPagar: { select: { saldoPendiente: true } } } },
} satisfies Prisma.ProveedorInclude;

type ProveedorWithRelations = Prisma.ProveedorGetPayload<{ include: typeof proveedorRelations }>;

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string, active?: string) {
    const term = search?.trim();
    const rows = await this.prisma.proveedor.findMany({
      where: {
        ...(term ? { OR: [
          { razonSocial: { contains: term, mode: "insensitive" } },
          { nombreComercial: { contains: term, mode: "insensitive" } },
          { ruc: { contains: term } },
        ] } : {}),
        ...(active === "true" ? { estado: true } : active === "false" ? { estado: false } : {}),
      },
      orderBy: { razonSocial: "asc" },
      include: proveedorRelations,
    });

    return rows.map((row) => this.view(row));
  }

  async get(id: string) {
    const row = await this.find(id);
    return this.view(row);
  }

  async create(dto: CreateProveedorDto) {
    try {
      const created = await this.prisma.proveedor.create({
        data: this.createData(dto),
        include: proveedorRelations,
      });
      return this.view(created);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateProveedorDto) {
    await this.find(id);
    try {
      const updated = await this.prisma.proveedor.update({
        where: { id: BigInt(id) },
        data: this.updateData(dto),
        include: proveedorRelations,
      });
      return this.view(updated);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private async find(id: string) {
    let proveedorId: bigint;
    try {
      proveedorId = BigInt(id);
    } catch {
      throw new NotFoundException("Proveedor no encontrado");
    }
    const row = await this.prisma.proveedor.findUnique({ where: { id: proveedorId }, include: proveedorRelations });
    if (!row) throw new NotFoundException("Proveedor no encontrado");
    return row;
  }

  private createData(dto: CreateProveedorDto): Prisma.ProveedorUncheckedCreateInput {
    return {
      ruc: dto.ruc.trim(),
      razonSocial: dto.razonSocial.trim(),
      nombreComercial: this.optional(dto.nombreComercial),
      telefono: this.optional(dto.telefono),
      correo: this.optional(dto.correo)?.toLowerCase() ?? null,
      direccion: this.optional(dto.direccion),
    };
  }

  private updateData(dto: UpdateProveedorDto): Prisma.ProveedorUncheckedUpdateInput {
    return {
      ...(dto.ruc !== undefined ? { ruc: dto.ruc.trim() } : {}),
      ...(dto.razonSocial !== undefined ? { razonSocial: dto.razonSocial.trim() } : {}),
      ...(dto.nombreComercial !== undefined ? { nombreComercial: this.optional(dto.nombreComercial) } : {}),
      ...(dto.telefono !== undefined ? { telefono: this.optional(dto.telefono) } : {}),
      ...(dto.correo !== undefined ? { correo: this.optional(dto.correo)?.toLowerCase() ?? null } : {}),
      ...(dto.direccion !== undefined ? { direccion: this.optional(dto.direccion) } : {}),
      ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
    };
  }

  private optional(value: string | undefined) {
    return value === undefined ? undefined : value.trim() || null;
  }

  private view(row: ProveedorWithRelations) {
    return {
      id: row.id.toString(),
      ruc: row.ruc,
      razonSocial: row.razonSocial,
      nombreComercial: row.nombreComercial ?? "",
      telefono: row.telefono ?? "",
      correo: row.correo ?? "",
      direccion: row.direccion ?? "",
      estado: row.estado,
      compras: row.compras.length,
      saldoPendiente: row.compras.reduce((sum, compra) => sum + Number(compra.cuentaPagar?.saldoPendiente ?? 0), 0),
    };
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException("Ya existe un proveedor con ese RUC");
    }
    throw error;
  }
}
