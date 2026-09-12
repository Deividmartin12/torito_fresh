import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CATEGORIA_PAGO_TRABAJADOR, esPagoTrabajador } from '../common/expense-categories';
import { etiquetaMetodoPago } from '../common/payment-method-label';
import { resolverTrabajadorAutor } from '../common/worker-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
} from './expenses.dto';

/** Un gasto siempre se lee con su autor, su beneficiario, su proveedor y su método de pago. */
const CON_RELACIONES = {
  trabajador: true,
  beneficiario: true,
  proveedor: true,
  metodoPago: { include: { categoria: true } },
} as const;

type CategoriaRow = { id: bigint; nombre: string; sistema: boolean };

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(from?: string, to?: string, trabajadorId?: string, beneficiarioId?: string) {
    // `Gasto.fecha` es una columna de solo fecha guardada a medianoche UTC, así que se
    // filtra con límites UTC para que un gasto fechado justo en `from` entre y `to` sea inclusivo.
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
      where: {
        ...(hasRange ? { fecha: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } } : {}),
        ...(trabajadorId ? { trabajadorId: BigInt(trabajadorId) } : {}),
        ...(beneficiarioId ? { beneficiarioId: BigInt(beneficiarioId) } : {}),
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 1000,
      include: CON_RELACIONES,
    });
    return rows.map((row) => this.view(row));
  }

  async create(dto: CreateExpenseDto, actor: AuthUser) {
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
    let proveedorId: bigint | undefined;
    if (dto.proveedorId) {
      const proveedor = await this.prisma.proveedor.findUnique({
        where: { id: BigInt(dto.proveedorId) },
      });
      if (!proveedor) throw new BadRequestException('El proveedor seleccionado no existe');
      proveedorId = proveedor.id;
    }
    const trabajadorId = await resolverTrabajadorAutor(this.prisma, actor, dto.trabajadorId);
    const metodoPagoId = await this.validarMetodoDePago(dto.metodoPagoId, trabajadorId);
    const beneficiarioId = await this.resolverBeneficiario(categoria, dto.beneficiarioId);
    const row = await this.prisma.gasto.create({
      data: {
        fecha: date,
        concepto: dto.concepto.trim(),
        categoria,
        monto: dto.monto,
        comprobante: dto.comprobante?.trim() || null,
        observaciones: dto.observaciones?.trim() || null,
        trabajadorId,
        beneficiarioId,
        proveedorId,
        metodoPagoId,
      },
      include: CON_RELACIONES,
    });
    return this.view(row);
  }

  /**
   * Beneficiario del gasto: el trabajador al que se le está pagando.
   *
   * Solo tiene sentido en la categoría fija "Pago a trabajador", donde es obligatorio; en
   * cualquier otra se rechaza. Así el reporte por trabajador suma remuneraciones reales y
   * no gastos sueltos que alguien haya asociado a una persona por error.
   */
  private async resolverBeneficiario(categoria: string, beneficiarioId?: string | null) {
    const solicitado = beneficiarioId?.toString().trim();
    if (!esPagoTrabajador(categoria)) {
      if (solicitado)
        throw new BadRequestException(
          `Solo los gastos de la categoría "${CATEGORIA_PAGO_TRABAJADOR}" se asocian a un trabajador`,
        );
      return null;
    }
    if (!solicitado)
      throw new BadRequestException('Selecciona el trabajador al que se le está pagando');
    let id: bigint;
    try {
      id = BigInt(solicitado);
    } catch {
      throw new BadRequestException('El trabajador seleccionado no es válido');
    }
    const trabajador = await this.prisma.trabajador.findFirst({
      where: { id, estado: true },
      select: { id: true },
    });
    if (!trabajador)
      throw new BadRequestException('El trabajador seleccionado no existe o está inactivo');
    return trabajador.id;
  }

  /**
   * Un método con dueño (el Yape de un repartidor) solo lo puede usar ese trabajador; los
   * globales (Efectivo) son de todos. Es la misma regla que aplica el cobro de una venta.
   */
  private async validarMetodoDePago(metodoPagoId: string | undefined, trabajadorId: bigint) {
    if (!metodoPagoId) return null;
    const metodo = await this.prisma.metodoPago.findUnique({
      where: { id: BigInt(metodoPagoId) },
      include: { categoria: true },
    });
    if (!metodo || !metodo.estado || metodo.categoria?.estado === false)
      throw new BadRequestException('El método de pago no está disponible');
    if (metodo.trabajadorId !== null && metodo.trabajadorId !== trabajadorId)
      throw new BadRequestException(
        `El método ${etiquetaMetodoPago(metodo)} pertenece a otro trabajador`,
      );
    return metodo.id;
  }

  async update(id: string, dto: UpdateExpenseDto, actor: AuthUser) {
    const gastoId = this.parseId(id);
    const current = await this.prisma.gasto.findUnique({ where: { id: gastoId } });
    if (!current) throw new NotFoundException('Gasto no encontrado');

    const data: Prisma.GastoUpdateInput = {};
    if (dto.fecha !== undefined) {
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
      data.fecha = date;
    }
    if (dto.concepto !== undefined) data.concepto = dto.concepto.trim();
    if (dto.categoria !== undefined) {
      const categoria = this.categoryName(dto.categoria);
      const exists = await this.findCategoryByName(categoria);
      if (!exists) throw new BadRequestException('Selecciona una categoría de gasto registrada');
      data.categoria = categoria;
    }
    if (dto.monto !== undefined) data.monto = dto.monto;
    if (dto.comprobante !== undefined) data.comprobante = dto.comprobante.trim() || null;
    if (dto.observaciones !== undefined) data.observaciones = dto.observaciones.trim() || null;
    if (dto.proveedorId !== undefined) {
      if (dto.proveedorId) {
        const proveedor = await this.prisma.proveedor.findUnique({
          where: { id: BigInt(dto.proveedorId) },
        });
        if (!proveedor) throw new BadRequestException('El proveedor seleccionado no existe');
        data.proveedor = { connect: { id: proveedor.id } };
      } else {
        data.proveedor = { disconnect: true };
      }
    }

    // Reasignar quién registró el gasto solo lo puede un admin, y solo si lo pide
    // explícitamente; si el DTO no trae `trabajadorId` se conserva el autor original.
    const autorId = dto.trabajadorId
      ? await resolverTrabajadorAutor(this.prisma, actor, dto.trabajadorId)
      : current.trabajadorId;
    if (dto.trabajadorId) data.trabajador = { connect: { id: autorId! } };

    if (dto.metodoPagoId !== undefined) {
      const metodoPagoId = dto.metodoPagoId
        ? await this.validarMetodoDePago(dto.metodoPagoId, autorId!)
        : null;
      data.metodoPago = metodoPagoId ? { connect: { id: metodoPagoId } } : { disconnect: true };
    }

    // El beneficiario se recalcula siempre contra la categoría que queda vigente: si el
    // gasto deja de ser "Pago a trabajador" hay que soltar al trabajador, y si pasa a serlo
    // hay que exigirlo, aunque el body no toque el campo.
    const categoriaVigente = dto.categoria !== undefined ? data.categoria! : current.categoria;
    const beneficiarioVigente =
      dto.beneficiarioId !== undefined
        ? dto.beneficiarioId
        : (current.beneficiarioId?.toString() ?? undefined);
    const beneficiarioId = await this.resolverBeneficiario(
      categoriaVigente as string,
      beneficiarioVigente,
    );
    data.beneficiario = beneficiarioId ? { connect: { id: beneficiarioId } } : { disconnect: true };

    const row = await this.prisma.gasto.update({
      where: { id: gastoId },
      data,
      include: CON_RELACIONES,
    });
    return this.view(row);
  }

  async categories() {
    const rows = await this.prisma.$queryRaw<CategoriaRow[]>(
      Prisma.sql`SELECT id, nombre, sistema FROM categoria_gasto ORDER BY nombre ASC`,
    );
    return rows.map((row) => this.categoryView(row));
  }

  async createCategory(dto: CreateExpenseCategoryDto) {
    const nombre = this.categoryName(dto.categoria);
    if (await this.findCategoryByName(nombre))
      throw new ConflictException('Ya existe una categoría con ese nombre');
    const [category] = await this.prisma.$queryRaw<CategoriaRow[]>(
      Prisma.sql`INSERT INTO categoria_gasto (nombre, created_at, updated_at) VALUES (${nombre}, NOW(), NOW()) RETURNING id, nombre, sistema`,
    );
    return this.categoryView(category);
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto) {
    const current = await this.findCategory(id);
    this.exigirCategoriaEditable(current);
    const nombre = this.categoryName(dto.categoria);
    const duplicate = await this.findCategoryByName(nombre);
    if (duplicate && duplicate.id !== current.id)
      throw new ConflictException('Ya existe una categoría con ese nombre');
    const category = await this.prisma.$transaction(async (tx) => {
      const [updated] = await tx.$queryRaw<CategoriaRow[]>(
        Prisma.sql`UPDATE categoria_gasto SET nombre = ${nombre}, updated_at = NOW() WHERE id = ${current.id} RETURNING id, nombre, sistema`,
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
    this.exigirCategoriaEditable(category);
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

  /**
   * Las categorías del sistema son parte de la lógica, no del catálogo editable:
   * "Pago a trabajador" es la que activa el campo de beneficiario en el formulario de
   * gasto, así que renombrarla o borrarla dejaría gastos huérfanos de esa regla.
   */
  private exigirCategoriaEditable(category: CategoriaRow) {
    if (category.sistema)
      throw new ConflictException(
        `La categoría "${category.nombre}" es fija del sistema: no se puede editar ni eliminar`,
      );
  }

  private parseId(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new NotFoundException('Gasto no encontrado');
    }
  }

  private categoryName(value: string) {
    const nombre = value.trim();
    if (!nombre) throw new BadRequestException('El nombre de la categoría es obligatorio');
    return nombre;
  }

  private async findCategory(id: string) {
    try {
      const [row] = await this.prisma.$queryRaw<CategoriaRow[]>(
        Prisma.sql`SELECT id, nombre, sistema FROM categoria_gasto WHERE id = ${BigInt(id)}`,
      );
      if (row) return row;
    } catch {
      /* Invalid identifiers are handled as missing records. */
    }
    throw new NotFoundException('Categoría de gasto no encontrada');
  }

  private categoryView(row: CategoriaRow) {
    return { id: row.id.toString(), nombre: row.nombre, sistema: row.sistema };
  }

  private async findCategoryByName(nombre: string) {
    const [row] = await this.prisma.$queryRaw<CategoriaRow[]>(
      Prisma.sql`SELECT id, nombre, sistema FROM categoria_gasto WHERE nombre = ${nombre}`,
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
      proveedorId: row.proveedorId?.toString() ?? null,
      proveedor: row.proveedor?.razonSocial ?? null,
      trabajadorId: row.trabajadorId?.toString() ?? null,
      registradoPor: row.trabajador
        ? `${row.trabajador.nombres} ${row.trabajador.apellidos}`
        : null,
      beneficiarioId: row.beneficiarioId?.toString() ?? null,
      beneficiario: row.beneficiario
        ? `${row.beneficiario.nombres} ${row.beneficiario.apellidos}`
        : null,
      metodoPagoId: row.metodoPagoId?.toString() ?? null,
      metodoPago: row.metodoPago ? etiquetaMetodoPago(row.metodoPago) : null,
    };
  }
}
