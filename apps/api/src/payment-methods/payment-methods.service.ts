import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { etiquetaMetodoPago } from '../common/payment-method-label';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentMethodCategoryDto,
  CreatePaymentMethodDto,
  UpdatePaymentMethodCategoryDto,
  UpdatePaymentMethodDto,
} from './payment-methods.dto';

const CON_RELACIONES = { categoria: true, trabajador: true } as const;

/**
 * Administración de los métodos de cobro. Un método es una categoría (YAPE) con su
 * referencia (el número) y un dueño opcional: si tiene dueño solo lo usa ese trabajador,
 * si no lo tiene lo usan todos (el caso del Efectivo).
 */
@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(trabajadorId?: string) {
    const rows = await this.prisma.metodoPago.findMany({
      where: trabajadorId
        ? { OR: [{ trabajadorId: null }, { trabajadorId: BigInt(trabajadorId) }] }
        : undefined,
      orderBy: [{ categoria: { nombre: 'asc' } }, { referencia: 'asc' }],
      include: CON_RELACIONES,
    });
    return rows.map((row) => this.view(row));
  }

  async create(dto: CreatePaymentMethodDto) {
    const categoria = await this.categoriaActiva(dto.categoriaId);
    const referencia = this.limpiar(dto.referencia);
    if (categoria.requiereReferencia && !referencia) {
      throw new BadRequestException(
        `Ingresa la referencia de ${categoria.nombre} (número de Yape, cuenta, etc.)`,
      );
    }
    const trabajadorId = await this.trabajadorActivo(dto.trabajadorId);
    await this.exigirQueNoSeRepita(categoria.id, referencia, trabajadorId);

    const row = await this.prisma.metodoPago.create({
      data: {
        categoriaId: categoria.id,
        nombre: this.limpiar(dto.nombre),
        referencia,
        trabajadorId,
        estado: dto.estado ?? true,
      },
      include: CON_RELACIONES,
    });
    return this.view(row);
  }

  async update(id: string, dto: UpdatePaymentMethodDto) {
    const current = await this.find(id);

    const categoria =
      dto.categoriaId !== undefined
        ? await this.categoriaActiva(dto.categoriaId)
        : current.categoria;
    const referencia =
      dto.referencia !== undefined ? this.limpiar(dto.referencia) : current.referencia;
    if (categoria?.requiereReferencia && !referencia) {
      throw new BadRequestException(
        `Ingresa la referencia de ${categoria.nombre} (número de Yape, cuenta, etc.)`,
      );
    }
    const trabajadorId =
      dto.trabajadorId !== undefined
        ? await this.trabajadorActivo(dto.trabajadorId)
        : current.trabajadorId;
    await this.exigirQueNoSeRepita(categoria?.id ?? null, referencia, trabajadorId, current.id);

    const row = await this.prisma.metodoPago.update({
      where: { id: current.id },
      data: {
        ...(dto.categoriaId !== undefined ? { categoriaId: categoria!.id } : {}),
        ...(dto.nombre !== undefined ? { nombre: this.limpiar(dto.nombre) } : {}),
        ...(dto.referencia !== undefined ? { referencia } : {}),
        ...(dto.trabajadorId !== undefined ? { trabajadorId } : {}),
        ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
      },
      include: CON_RELACIONES,
    });
    return this.view(row);
  }

  // ---- Categorías ----

  async categories() {
    const rows = await this.prisma.categoriaMetodoPago.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { metodos: true } } },
    });
    return rows.map((row) => ({
      id: row.id.toString(),
      nombre: row.nombre,
      icono: row.icono,
      requiereReferencia: row.requiereReferencia,
      estado: row.estado,
      metodos: row._count.metodos,
    }));
  }

  async createCategory(dto: CreatePaymentMethodCategoryDto) {
    try {
      const row = await this.prisma.categoriaMetodoPago.create({
        data: {
          nombre: dto.nombre.trim().toUpperCase(),
          icono: this.limpiar(dto.icono),
          requiereReferencia: dto.requiereReferencia ?? false,
          estado: dto.estado ?? true,
        },
      });
      return { ...this.categoryView(row), metodos: 0 };
    } catch (error) {
      throw this.traducirCategoria(error);
    }
  }

  async updateCategory(id: string, dto: UpdatePaymentMethodCategoryDto) {
    const categoriaId = this.parseId(id, 'Categoría no encontrada');
    try {
      const row = await this.prisma.categoriaMetodoPago.update({
        where: { id: categoriaId },
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim().toUpperCase() } : {}),
          ...(dto.icono !== undefined ? { icono: this.limpiar(dto.icono) } : {}),
          ...(dto.requiereReferencia !== undefined
            ? { requiereReferencia: dto.requiereReferencia }
            : {}),
          ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
        },
        include: { _count: { select: { metodos: true } } },
      });
      return { ...this.categoryView(row), metodos: row._count.metodos };
    } catch (error) {
      throw this.traducirCategoria(error);
    }
  }

  /** Solo se puede borrar una categoría vacía: si tiene métodos, quedarían huérfanos. */
  async deleteCategory(id: string) {
    const categoriaId = this.parseId(id, 'Categoría no encontrada');
    const usados = await this.prisma.metodoPago.count({ where: { categoriaId } });
    if (usados > 0) {
      throw new ConflictException(
        `No se puede eliminar: hay ${usados} método(s) de pago en esta categoría`,
      );
    }
    await this.prisma.categoriaMetodoPago.delete({ where: { id: categoriaId } });
    return { id };
  }

  // ---- Auxiliares ----

  private async find(id: string) {
    const row = await this.prisma.metodoPago.findUnique({
      where: { id: this.parseId(id, 'Método de pago no encontrado') },
      include: CON_RELACIONES,
    });
    if (!row) throw new NotFoundException('Método de pago no encontrado');
    return row;
  }

  private async categoriaActiva(id: string) {
    const categoria = await this.prisma.categoriaMetodoPago.findUnique({
      where: { id: this.parseId(id, 'La categoría seleccionada no existe') },
    });
    if (!categoria) throw new BadRequestException('La categoría seleccionada no existe');
    if (!categoria.estado) throw new BadRequestException('La categoría seleccionada está inactiva');
    return categoria;
  }

  private async trabajadorActivo(id: string | undefined) {
    const valor = id?.trim();
    if (!valor) return null;
    const trabajador = await this.prisma.trabajador.findFirst({
      where: { id: this.parseId(valor, 'El trabajador seleccionado no existe'), estado: true },
      select: { id: true },
    });
    if (!trabajador) throw new BadRequestException('El trabajador seleccionado no existe o está inactivo');
    return trabajador.id;
  }

  /**
   * Además del índice único con COALESCE que protege la tabla, se chequea antes para poder
   * dar un mensaje entendible en vez del error crudo de Postgres.
   */
  private async exigirQueNoSeRepita(
    categoriaId: bigint | null,
    referencia: string | null,
    trabajadorId: bigint | null,
    excluirId?: bigint,
  ) {
    const repetido = await this.prisma.metodoPago.findFirst({
      where: {
        categoriaId,
        referencia,
        trabajadorId,
        ...(excluirId ? { id: { not: excluirId } } : {}),
      },
    });
    if (repetido) {
      throw new ConflictException(
        trabajadorId
          ? 'Ese trabajador ya tiene registrado ese método de pago'
          : 'Ya existe ese método de pago disponible para todos',
      );
    }
  }

  private parseId(id: string, mensaje: string) {
    try {
      return BigInt(id);
    } catch {
      throw new NotFoundException(mensaje);
    }
  }

  private limpiar(value: string | undefined) {
    return value?.trim() || null;
  }

  private traducirCategoria(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return new ConflictException('Ya existe una categoría con ese nombre');
      if (error.code === 'P2025') return new NotFoundException('Categoría no encontrada');
    }
    return error;
  }

  private categoryView(row: {
    id: bigint;
    nombre: string;
    icono: string | null;
    requiereReferencia: boolean;
    estado: boolean;
  }) {
    return {
      id: row.id.toString(),
      nombre: row.nombre,
      icono: row.icono,
      requiereReferencia: row.requiereReferencia,
      estado: row.estado,
    };
  }

  private view(row: Prisma.MetodoPagoGetPayload<{ include: typeof CON_RELACIONES }>) {
    return {
      id: row.id.toString(),
      // `nombre` lleva la etiqueta ya armada, que es lo que se muestra en toda la app.
      nombre: etiquetaMetodoPago(row),
      nombreLibre: row.nombre,
      categoriaId: row.categoriaId?.toString() ?? null,
      categoria: row.categoria?.nombre ?? null,
      icono: row.categoria?.icono ?? null,
      referencia: row.referencia,
      trabajadorId: row.trabajadorId?.toString() ?? null,
      trabajador: row.trabajador
        ? `${row.trabajador.nombres} ${row.trabajador.apellidos}`
        : null,
      estado: row.estado,
    };
  }
}
