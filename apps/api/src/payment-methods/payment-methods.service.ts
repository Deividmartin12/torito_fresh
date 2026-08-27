import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './payment-methods.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.metodoPago.findMany({ orderBy: { nombre: 'asc' } });
    return rows.map((row) => this.view(row));
  }

  async create(dto: CreatePaymentMethodDto) {
    try {
      return this.view(await this.prisma.metodoPago.create({ data: this.createData(dto) }));
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdatePaymentMethodDto) {
    await this.find(id);
    try {
      return this.view(
        await this.prisma.metodoPago.update({
          where: { id: BigInt(id) },
          data: this.updateData(dto),
        }),
      );
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private async find(id: string) {
    try {
      const row = await this.prisma.metodoPago.findUnique({ where: { id: BigInt(id) } });
      if (row) return row;
    } catch {
      /* Invalid identifiers are treated as missing records. */
    }
    throw new NotFoundException('Método de pago no encontrado');
  }

  private createData(dto: CreatePaymentMethodDto): Prisma.MetodoPagoUncheckedCreateInput {
    return {
      nombre: dto.nombre.trim().toUpperCase(),
      requiereOperacion: dto.requiereOperacion ?? false,
      estado: dto.estado ?? true,
    };
  }

  private updateData(dto: UpdatePaymentMethodDto): Prisma.MetodoPagoUncheckedUpdateInput {
    return {
      ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim().toUpperCase() } : {}),
      ...(dto.requiereOperacion !== undefined ? { requiereOperacion: dto.requiereOperacion } : {}),
      ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
    };
  }

  private view(row: { id: bigint; nombre: string; requiereOperacion: boolean; estado: boolean }) {
    return {
      id: row.id.toString(),
      nombre: row.nombre,
      requiereOperacion: row.requiereOperacion,
      estado: row.estado,
    };
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ya existe un método de pago con ese nombre');
    }
    throw error;
  }
}
