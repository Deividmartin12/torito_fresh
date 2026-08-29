import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseCategoryDto,
} from './expenses.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(from?: string, to?: string) {
    // `Gasto.fecha` is a date-only column stored at UTC midnight; filter with UTC boundaries
    // so an expense dated exactly on `from` is included and `to` stays inclusive.
    const hasRange = Boolean(from || to);
    const gte = from ? new Date(`${from}T00:00:00Z`) : undefined;
    let lt: Date | undefined;
    if (to) {
      lt = new Date(`${to}T00:00:00Z`);
      lt.setUTCDate(lt.getUTCDate() + 1);
    }
    if ((gte && Number.isNaN(gte.getTime())) || (lt && Number.isNaN(lt.getTime()))) {
      throw new BadRequestException('El rango de fechas no es válido');
    }
    const rows = await this.prisma.gasto.findMany({
      where: hasRange
        ? { fecha: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } }
        : undefined,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: hasRange ? 500 : 200,
      include: { trabajador: true },
    });
    return rows.map((row) => this.view(row));
  }

  async create(dto: CreateExpenseDto) {
    const date = new Date(`${dto.fecha.slice(0, 10)}T00:00:00-05:00`);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException('La fecha del gasto no es válida');
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (dto.fecha.slice(0, 10) > today)
      throw new BadRequestException('La fecha del gasto no puede estar en el futuro');

    const categoria = this.categoryName(dto.categoria);
    const exists = await this.findCategoryByName(categoria);
    if (!exists) throw new BadRequestException('Selecciona una categoría de gasto registrada');
    const worker = await this.prisma.trabajador.findFirst({
      where: { estado: true },
      orderBy: { id: 'asc' },
    });
    const row = await this.prisma.gasto.create({
      data: {
        fecha: date,
        concepto: dto.concepto.trim(),
        categoria,
        monto: dto.monto,
        comprobante: dto.comprobante?.trim() || null,
        observaciones: dto.observaciones?.trim() || null,
        trabajadorId: worker?.id,
      },
      include: { trabajador: true },
    });
    return this.view(row);
  }

  async categories() {
    const rows = await this.prisma.$queryRaw<Array<{ id: bigint; nombre: string }>>(
      Prisma.sql`SELECT id, nombre FROM categoria_gasto ORDER BY nombre ASC`,
    );
    return rows.map((row) => this.categoryView(row));
  }

  async createCategory(dto: CreateExpenseCategoryDto) {
    const nombre = this.categoryName(dto.categoria);
    if (await this.findCategoryByName(nombre))
      throw new ConflictException('Ya existe una categoría con ese nombre');
    const [category] = await this.prisma.$queryRaw<Array<{ id: bigint; nombre: string }>>(
      Prisma.sql`INSERT INTO categoria_gasto (nombre, created_at, updated_at) VALUES (${nombre}, NOW(), NOW()) RETURNING id, nombre`,
    );
    return this.categoryView(category);
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto) {
    const current = await this.findCategory(id);
    const nombre = this.categoryName(dto.categoria);
    const duplicate = await this.findCategoryByName(nombre);
    if (duplicate && duplicate.id !== current.id)
      throw new ConflictException('Ya existe una categoría con ese nombre');
    const category = await this.prisma.$transaction(async (tx) => {
      const [updated] = await tx.$queryRaw<Array<{ id: bigint; nombre: string }>>(
        Prisma.sql`UPDATE categoria_gasto SET nombre = ${nombre}, updated_at = NOW() WHERE id = ${current.id} RETURNING id, nombre`,
      );
      if (current.nombre !== nombre)
        await tx.gasto.updateMany({
          where: { categoria: current.nombre },
          data: { categoria: nombre },
        });
      return updated;
    });
    return this.categoryView(category);
  }

  async deleteCategory(id: string) {
    const category = await this.findCategory(id);
    const count = await this.prisma.gasto.count({ where: { categoria: category.nombre } });
    if (count)
      throw new ConflictException(
        'No se puede eliminar una categoría que tiene gastos registrados',
      );
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM categoria_gasto WHERE id = ${category.id}`,
    );
    return { id: category.id.toString() };
  }

  private categoryName(value: string) {
    const nombre = value.trim();
    if (!nombre) throw new BadRequestException('El nombre de la categoría es obligatorio');
    return nombre;
  }

  private async findCategory(id: string) {
    try {
      const [row] = await this.prisma.$queryRaw<Array<{ id: bigint; nombre: string }>>(
        Prisma.sql`SELECT id, nombre FROM categoria_gasto WHERE id = ${BigInt(id)}`,
      );
      if (row) return row;
    } catch {
      /* Invalid identifiers are handled as missing records. */
    }
    throw new NotFoundException('Categoría de gasto no encontrada');
  }

  private categoryView(row: { id: bigint; nombre: string }) {
    return { id: row.id.toString(), nombre: row.nombre };
  }

  private async findCategoryByName(nombre: string) {
    const [row] = await this.prisma.$queryRaw<Array<{ id: bigint; nombre: string }>>(
      Prisma.sql`SELECT id, nombre FROM categoria_gasto WHERE nombre = ${nombre}`,
    );
    return row;
  }

  private view(row: any) {
    return {
      id: row.id.toString(),
      fecha: row.fecha,
      concepto: row.concepto,
      categoria: row.categoria,
      monto: Number(row.monto),
      comprobante: row.comprobante,
      observaciones: row.observaciones,
      registradoPor: row.trabajador
        ? `${row.trabajador.nombres} ${row.trabajador.apellidos}`
        : null,
    };
  }
}
