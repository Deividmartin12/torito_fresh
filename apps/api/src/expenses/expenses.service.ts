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
import {
  filtroUnidad,
  resolverAlcanceUnidad,
  resolverUnidadDeEscritura,
} from '../common/unit-context';
import { resolverTrabajadorAutor } from '../common/worker-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
} from './expenses.dto';

/**
 * Un gasto siempre se lee con su categoría, su autor, su beneficiario, su proveedor y su
 * método de pago. La categoría entra por la relación: el nombre vive solo en
 * `categoria_gasto`, el gasto guarda el enlace.
 */
const CON_RELACIONES = {
  unidadNegocio: { select: { nombre: true } },
  categoria: true,
  trabajador: true,
  beneficiario: true,
  proveedor: true,
  metodoPago: { include: { categoria: true } },
} as const;

type CategoriaRow = { id: bigint; nombre: string; sistema: boolean };

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    actor: AuthUser,
    from?: string,
    to?: string,
    trabajadorId?: string,
    beneficiarioId?: string,
    unidad?: string,
  ) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
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
        ...filtroUnidad(alcance),
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

  async create(dto: CreateExpenseDto, actor: AuthUser, unidad?: string) {
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

    const categoria = await this.findCategory(
      dto.categoriaId,
      'Selecciona una categoría de gasto registrada',
    );
    let proveedorId: bigint | undefined;
    if (dto.proveedorId) {
      const proveedor = await this.prisma.proveedor.findUnique({
        where: { id: BigInt(dto.proveedorId) },
      });
      if (!proveedor) throw new BadRequestException('El proveedor seleccionado no existe');
      proveedorId = proveedor.id;
    }
    const trabajadorId = await resolverTrabajadorAutor(this.prisma, actor, dto.trabajadorId);
    // El gasto cae en la unidad que el usuario tiene elegida, no en la del trabajador que lo
    // teclea. Solo se exige que coincidan cuando el admin lo registra a nombre de otro.
    const unidadNegocioId = await resolverUnidadDeEscritura(this.prisma, {
      actor,
      unidadSolicitada: unidad,
      atribuidaA: dto.trabajadorId ? trabajadorId : null,
    });
    const metodoPagoId = await this.validarMetodoDePago(dto.metodoPagoId, trabajadorId);
    const beneficiarioId = await this.resolverBeneficiario(categoria.nombre, dto.beneficiarioId);
    const row = await this.prisma.gasto.create({
      data: {
        unidadNegocioId,
        fecha: date,
        concepto: dto.concepto.trim(),
        categoriaId: categoria.id,
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

  async update(id: string, dto: UpdateExpenseDto, actor: AuthUser, unidad?: string) {
    const gastoId = this.parseId(id);
    // Con la unidad activa: sin ella, un admin parado en un puesto satélite recibía "Gasto no
    // encontrado" al editar un gasto de ese puesto, porque el alcance caía a la Principal.
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    // Un gasto de otra unidad no es "prohibido", es inexistente.
    const current = await this.prisma.gasto.findFirst({
      where: { id: gastoId, ...filtroUnidad(alcance) },
      include: { categoria: { select: { nombre: true } } },
    });
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
    let categoriaNueva: CategoriaRow | undefined;
    if (dto.categoriaId !== undefined) {
      categoriaNueva = await this.findCategory(
        dto.categoriaId,
        'Selecciona una categoría de gasto registrada',
      );
      data.categoria = { connect: { id: categoriaNueva.id } };
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
    if (dto.trabajadorId) {
      // Editar no mueve el gasto de unidad —igual que una venta, que tampoco cambia de unidad
      // al corregirla—, así que el trabajador nuevo tiene que ser de la unidad del gasto.
      const autor = await this.prisma.trabajador.findFirst({
        where: { id: autorId! },
        select: { unidadNegocioId: true },
      });
      if (autor?.unidadNegocioId !== current.unidadNegocioId) {
        throw new BadRequestException('El trabajador seleccionado es de otra unidad de negocio');
      }
      data.trabajador = { connect: { id: autorId! } };
    }

    if (dto.metodoPagoId !== undefined) {
      const metodoPagoId = dto.metodoPagoId
        ? await this.validarMetodoDePago(dto.metodoPagoId, autorId!)
        : null;
      data.metodoPago = metodoPagoId ? { connect: { id: metodoPagoId } } : { disconnect: true };
    }

    // El beneficiario se recalcula siempre contra la categoría que queda vigente: si el
    // gasto deja de ser "Pago a trabajador" hay que soltar al trabajador, y si pasa a serlo
    // hay que exigirlo, aunque el body no toque el campo.
    const categoriaVigente = categoriaNueva?.nombre ?? current.categoria.nombre;
    const beneficiarioVigente =
      dto.beneficiarioId !== undefined
        ? dto.beneficiarioId
        : (current.beneficiarioId?.toString() ?? undefined);
    const beneficiarioId = await this.resolverBeneficiario(categoriaVigente, beneficiarioVigente);
    data.beneficiario = beneficiarioId ? { connect: { id: beneficiarioId } } : { disconnect: true };

    const row = await this.prisma.gasto.update({
      where: { id: gastoId },
      data,
      include: CON_RELACIONES,
    });
    return this.view(row);
  }

  async categories() {
    const rows = await this.prisma.categoriaGasto.findMany({
      select: { id: true, nombre: true, sistema: true },
      orderBy: { nombre: 'asc' },
    });
    return rows.map((row) => this.categoryView(row));
  }

  async createCategory(dto: CreateExpenseCategoryDto) {
    const nombre = this.categoryName(dto.categoria);
    if (await this.findCategoryByName(nombre))
      throw new ConflictException('Ya existe una categoría con ese nombre');
    const category = await this.prisma.categoriaGasto.create({
      data: { nombre },
      select: { id: true, nombre: true, sistema: true },
    });
    return this.categoryView(category);
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto) {
    const current = await this.findCategory(id);
    this.exigirCategoriaEditable(current);
    const nombre = this.categoryName(dto.categoria);
    const duplicate = await this.findCategoryByName(nombre);
    if (duplicate && duplicate.id !== current.id)
      throw new ConflictException('Ya existe una categoría con ese nombre');
    // Renombrar ya no toca los gastos: ellos guardan el id de la categoría, así que el
    // nombre nuevo aparece solo en todos los que la usan.
    const category = await this.prisma.categoriaGasto.update({
      where: { id: current.id },
      data: { nombre },
      select: { id: true, nombre: true, sistema: true },
    });
    return this.categoryView(category);
  }

  async deleteCategory(id: string) {
    const category = await this.findCategory(id);
    this.exigirCategoriaEditable(category);
    const count = await this.prisma.gasto.count({ where: { categoriaId: category.id } });
    if (count)
      throw new ConflictException(
        'No se puede eliminar una categoría que tiene gastos registrados',
      );
    await this.prisma.categoriaGasto.delete({ where: { id: category.id } });
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

  /**
   * Busca la categoría por id. `mensajeInvalido` se usa cuando el id lo manda el formulario
   * de gasto: ahí un id que no existe es un dato mal elegido (400), no una ruta perdida.
   */
  private async findCategory(id: string, mensajeInvalido?: string): Promise<CategoriaRow> {
    const fallar = () => {
      throw mensajeInvalido
        ? new BadRequestException(mensajeInvalido)
        : new NotFoundException('Categoría de gasto no encontrada');
    };
    let categoriaId: bigint;
    try {
      categoriaId = BigInt(id);
    } catch {
      return fallar();
    }
    const row = await this.prisma.categoriaGasto.findUnique({
      where: { id: categoriaId },
      select: { id: true, nombre: true, sistema: true },
    });
    return row ?? fallar();
  }

  private categoryView(row: CategoriaRow) {
    return { id: row.id.toString(), nombre: row.nombre, sistema: row.sistema };
  }

  private async findCategoryByName(nombre: string) {
    return this.prisma.categoriaGasto.findUnique({
      where: { nombre },
      select: { id: true, nombre: true, sistema: true },
    });
  }

  private view(row: any) {
    return {
      id: row.id.toString(),
      fecha: row.fecha,
      concepto: row.concepto,
      categoriaId: row.categoriaId.toString(),
      categoria: row.categoria?.nombre ?? null,
      // Solo sirve cuando el admin mira el consolidado: ahí conviven gastos de varias
      // unidades y hay que poder distinguirlos de un vistazo.
      unidadNegocioId: row.unidadNegocioId?.toString() ?? null,
      unidad: row.unidadNegocio?.nombre ?? null,
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
