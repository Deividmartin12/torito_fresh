import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { etiquetaMetodoPago } from '../common/payment-method-label';
import { accountState as deriveAccountState, limaTodayKey } from '../common/receivables';
import { nextSequentialCode } from '../common/next-code';
import {
  AlcanceUnidad,
  exigirMismaUnidad,
  filtroUnidad,
  filtroUnidadPor,
  resolverAlcanceUnidad,
  resolverUnidadDeEscritura,
  unidadControlaInventario,
} from '../common/unit-context';
import { resolverTrabajadorAutor } from '../common/worker-context';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOperationalProductDto,
  CreateOperationalSaleDto,
  CreateOperationalWarehouseDto,
  CreateOwnPaymentMethodDto,
  CreateProductTypeDto,
  CreateReturnDto,
  RegisterOperationalPaymentDto,
  UpdateLoteDto,
  UpdateOperationalProductDto,
  UpdateOperationalSaleDto,
  UpdateReceivableDueDateDto,
} from './operations.dto';

type Transaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const saleCode = (id: bigint | number | string) => `V-${id.toString().padStart(6, '0')}`;

/**
 * Configuración de las transacciones que tocan stock (registrar y editar ventas).
 * `Serializable` evita que dos ventas simultáneas lean el mismo stock y lo vendan dos veces
 * (terminarían dejando stock negativo). Es el mismo modo que ya usa Producción.
 */
const TRANSACCION_DE_STOCK = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

const MOVEMENT_LABELS: Record<string, string> = {
  COMPRA: 'Entrada por compra',
  VENTA: 'Salida por venta',
  DEVOLUCION_VENTA: 'Devolución de cliente',
  DEVOLUCION_COMPRA: 'Devolución a proveedor',
  PRODUCCION: 'Producción',
  TRANSFERENCIA: 'Transferencia entre almacenes',
  AJUSTE: 'Ajuste de inventario',
};
const movementLabel = (operacion: string) =>
  MOVEMENT_LABELS[operacion] ?? operacion.replace(/_/g, ' ').toLowerCase();

/** Costo unitario promedio ponderado después de agregar `addQty` unidades a `addCost` cada una. */
const weightedAverage = (prevQty: number, prevCost: number, addQty: number, addCost: number) => {
  const total = prevQty + addQty;
  return total > 0 ? (prevQty * prevCost + addQty * addCost) / total : 0;
};

type MovementsFilter = {
  from?: string;
  to?: string;
  productoId?: string;
  almacenId?: string;
  tipoOperacion?: string;
  ref?: string;
};

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentMethodsService: PaymentMethodsService,
  ) {}

  async catalogs(actor: AuthUser, unidad?: string) {
    // Los combos del formulario tienen que ofrecer solo lo que esta unidad puede usar: si
    // mostraran los almacenes o los clientes de otra, el alta fallaría recién al guardar.
    // El catálogo de productos es la excepción: es compartido a propósito.
    //
    // Se resuelve con la MISMA función que usa `createSale`, no con el alcance de lectura, para
    // que el combo ofrezca exactamente la unidad donde va a caer la venta. Eso es lo que evita
    // el "El cliente seleccionado es de otra unidad de negocio" al guardar. De paso cubre
    // "Todo consolidado", que sirve para mirar reportes pero no para registrar.
    const unidadEscritura = await resolverUnidadDeEscritura(this.prisma, {
      actor,
      unidadSolicitada: unidad,
    });
    const unidadDestino = await this.prisma.unidadNegocio.findUnique({
      where: { id: unidadEscritura },
      select: { nombre: true, controlaInventario: true },
    });
    const alcance = { tipo: 'una', id: unidadEscritura } as const;
    const deUnidad = filtroUnidad(alcance);
    const [clientes, almacenes, productos, trabajadores, estadosInventario] = await Promise.all([
      this.prisma.cliente.findMany({
        where: { estado: true, ...deUnidad },
        orderBy: { nombreLegal: 'asc' },
      }),
      this.prisma.almacen.findMany({
        where: { estado: true, ...deUnidad },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.producto.findMany({ where: { estado: true }, orderBy: { nombre: 'asc' } }),
      this.prisma.trabajador.findMany({
        where: { estado: true, ...deUnidad },
        orderBy: { nombres: 'asc' },
      }),
      this.prisma.estadoInventario.findMany({
        where: { estado: true },
        orderBy: { nombre: 'asc' },
      }),
    ]);

    const debtByClient = await this.prisma.cuentaCobrar.groupBy({
      by: ['clienteId'],
      where: { saldoPendiente: { gt: 0 }, ...filtroUnidadPor('cliente', alcance) },
      _sum: { saldoPendiente: true },
      _count: { _all: true },
    });
    const debtMap = new Map(
      debtByClient.map((row) => [
        row.clienteId.toString(),
        { deuda: Number(row._sum.saldoPendiente ?? 0), comprobantes: row._count._all },
      ]),
    );

    return {
      clientes: clientes.map((item) => ({
        id: item.id.toString(),
        nombre: item.nombreLegal,
        documento: item.numeroDocumento,
        deudaActual: debtMap.get(item.id.toString())?.deuda ?? 0,
        comprobantesPendientes: debtMap.get(item.id.toString())?.comprobantes ?? 0,
      })),
      almacenes: almacenes.map((item) => ({
        id: item.id.toString(),
        nombre: item.nombre,
        codigo: item.codigo,
      })),
      productos: productos.map((item) => ({
        id: item.id.toString(),
        codigo: item.codigo,
        nombre: item.nombre,
        precioVenta: Number(item.precioVenta),
        costoReferencia: Number(item.costoReferencia),
      })),
      estadosInventario: estadosInventario.map((item) => ({
        id: item.id.toString(),
        nombre: item.nombre,
        codigo: item.codigo,
      })),
      // Para el selector "Registrado por" que solo ve el admin.
      trabajadores: trabajadores.map((item) => ({
        id: item.id.toString(),
        nombre: `${item.nombres} ${item.apellidos}`,
        codigo: item.cargo,
      })),
      trabajadorActualId: actor.trabajadorId,
      // En qué unidad va a quedar la venta, y si esa unidad lleva inventario. El formulario usa
      // ESTO y no la unidad del navegador: con "Todo consolidado" elegido las dos discrepan, y
      // lo que vale es lo que el servidor va a hacer de verdad.
      unidadEscritura: {
        id: unidadEscritura.toString(),
        nombre: unidadDestino?.nombre ?? '',
        controlaInventario: unidadDestino?.controlaInventario ?? true,
      },
      // Antes bastaba con que existiera *algún* trabajador. Ahora la venta se atribuye al del
      // usuario logueado, así que sin ese vínculo el formulario no puede registrar nada.
      preparado: Boolean(actor.trabajadorId && almacenes.length && productos.length),
    };
  }

  /**
   * Catálogo de productos. El catálogo en sí es compartido entre unidades (mismos productos,
   * mismos precios), pero la columna de stock NO: se suma solo sobre los almacenes de la
   * unidad. Sin eso, un puesto satélite vería como propio el stock de la principal.
   */
  async products(actor: AuthUser, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const rows = await this.prisma.producto.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        tipoProducto: true,
        stocks: { where: filtroUnidadPor('almacen', alcance) },
        _count: { select: { detallesVenta: true } },
      },
    });
    return rows.map((item) => ({
      id: item.id.toString(),
      codigo: item.codigo,
      nombre: item.nombre,
      tipo: item.tipoProducto.nombre,
      unidad: item.unidadMedida,
      capacidad: item.capacidadLitros ? `${Number(item.capacidadLitros)} L` : '-',
      precio: Number(item.precioVenta),
      costo: Number(item.costoReferencia),
      stock: item.stocks.reduce((total, stock) => total + Number(stock.cantidad), 0),
      lote: item.controlaLote,
      retornable: item.esRetornable,
      activo: item.estado,
      tieneVentas: item._count.detallesVenta > 0,
    }));
  }

  // Los lotes no tienen alta manual: nacen automáticamente al completar una producción.
  // Esta lectura solo lista lo que ya existe.
  //
  // El lote en sí es compartido (cuelga del producto, que también lo es), pero la columna
  // "disponible" NO: se suma solo sobre los almacenes de la unidad. Sin ese recorte, cada
  // puesto veía como propio el stock de todos los demás. Mismo criterio que `products()`.
  async lots(actor: AuthUser, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const rows = await this.prisma.lote.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { producto: true, stocks: { where: filtroUnidadPor('almacen', alcance) } },
    });
    return rows.map((row) => this.mapLot(row));
  }

  /**
   * Corrige a mano un lote existente: sus fechas de producción/vencimiento y su estado
   * (bloquearlo o reactivarlo). El código y el costo unitario no se editan porque el kardex
   * y los reportes de costo ya están calculados con esos valores.
   */
  async updateLot(id: string, dto: UpdateLoteDto) {
    const loteId = BigInt(id);
    const lote = await this.prisma.lote.findUnique({ where: { id: loteId } });
    if (!lote) throw new NotFoundException('El lote no existe');

    const toDay = (value?: string | null) =>
      value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : null;

    const data: Prisma.LoteUpdateInput = {};
    if (dto.fechaProduccion !== undefined) data.fechaProduccion = toDay(dto.fechaProduccion);
    if (dto.fechaVencimiento !== undefined) data.fechaVencimiento = toDay(dto.fechaVencimiento);
    if (dto.estado !== undefined) data.estado = dto.estado;

    const produccion =
      data.fechaProduccion !== undefined
        ? (data.fechaProduccion as Date | null)
        : lote.fechaProduccion;
    const vencimiento =
      data.fechaVencimiento !== undefined
        ? (data.fechaVencimiento as Date | null)
        : lote.fechaVencimiento;
    if (produccion && vencimiento && vencimiento < produccion)
      throw new BadRequestException(
        'La fecha de vencimiento no puede ser anterior a la de producción',
      );

    const updated = await this.prisma.lote.update({
      where: { id: loteId },
      data,
      include: { producto: true, stocks: true },
    });
    return this.mapLot(updated);
  }

  private mapLot(row: Prisma.LoteGetPayload<{ include: { producto: true; stocks: true } }>) {
    return {
      id: row.id.toString(),
      codigo: row.codigoLote,
      producto: row.producto.nombre,
      productoId: row.productoId.toString(),
      fechaProduccion: row.fechaProduccion,
      fechaVencimiento: row.fechaVencimiento,
      costo: Number(row.costoUnitario),
      disponible: row.stocks.reduce(
        (sum, stock) => sum + Math.max(Number(stock.cantidad) - Number(stock.cantidadReservada), 0),
        0,
      ),
      estado: row.estado,
    };
  }

  async productTypes() {
    const rows = await this.prisma.tipoProducto.findMany({
      where: { estado: true },
      orderBy: { nombre: 'asc' },
    });
    return rows.map((item) => ({ id: item.id.toString(), nombre: item.nombre }));
  }

  /**
   * Alta de un tipo de producto desde el combo "+ Agregar tipo" del formulario de producto.
   * Si el nombre ya existía (aunque estuviera inactivo) se reutiliza y se reactiva, para no
   * chocar con el índice único.
   */
  async createProductType(dto: CreateProductTypeDto) {
    const nombre = dto.nombre.trim();
    const row = await this.prisma.tipoProducto.upsert({
      where: { nombre },
      update: { estado: true },
      create: { nombre },
    });
    return { id: row.id.toString(), nombre: row.nombre };
  }

  async createProduct(dto: CreateOperationalProductDto) {
    const codigo = await nextSequentialCode('PRD', async () => {
      const ultimo = await this.prisma.producto.findFirst({
        where: { codigo: { startsWith: 'PRD-' } },
        orderBy: { codigo: 'desc' },
        select: { codigo: true },
      });
      return ultimo?.codigo ?? null;
    });
    const nombre = dto.nombre.trim();
    const tipo = dto.tipo.trim();
    const unidad = dto.unidad.trim().toUpperCase();
    const tipoProducto = await this.prisma.tipoProducto.upsert({
      where: { nombre: tipo },
      update: { estado: true },
      create: { nombre: tipo },
    });
    const product = await this.prisma.producto.create({
      data: {
        tipoProductoId: tipoProducto.id,
        codigo,
        nombre,
        unidadMedida: unidad,
        capacidadLitros: dto.capacidadLitros ?? null,
        precioVenta: dto.precio,
        costoReferencia: dto.costo,
        controlaLote: dto.controlaLote,
        esRetornable: dto.esRetornable,
      },
    });
    return { id: product.id.toString(), codigo: product.codigo, nombre: product.nombre };
  }

  async updateProduct(id: string, dto: UpdateOperationalProductDto) {
    let productId: bigint;
    try {
      productId = BigInt(id);
    } catch {
      throw new NotFoundException('Producto no encontrado');
    }
    const product = await this.prisma.producto.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // El tipo se maneja igual que al crear: se busca/crea por nombre.
    let tipoProductoId = product.tipoProductoId;
    const tipo = dto.tipo?.trim();
    if (tipo) {
      const tipoProducto = await this.prisma.tipoProducto.upsert({
        where: { nombre: tipo },
        update: { estado: true },
        create: { nombre: tipo },
      });
      tipoProductoId = tipoProducto.id;
    }

    const updated = await this.prisma.producto.update({
      where: { id: productId },
      data: {
        tipoProductoId,
        ...(dto.nombre?.trim() ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.unidad?.trim() ? { unidadMedida: dto.unidad.trim().toUpperCase() } : {}),
        ...(dto.capacidadLitros === undefined ? {} : { capacidadLitros: dto.capacidadLitros }),
        ...(dto.precio === undefined ? {} : { precioVenta: dto.precio }),
        ...(dto.costo === undefined ? {} : { costoReferencia: dto.costo }),
        ...(dto.controlaLote === undefined ? {} : { controlaLote: dto.controlaLote }),
        ...(dto.esRetornable === undefined ? {} : { esRetornable: dto.esRetornable }),
      },
    });
    return { id: updated.id.toString(), codigo: updated.codigo, nombre: updated.nombre };
  }

  async warehouses(actor: AuthUser, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const rows = await this.prisma.almacen.findMany({
      where: filtroUnidad(alcance),
      orderBy: { nombre: 'asc' },
      include: { responsable: true, stocks: true },
    });
    return rows.map((item) => ({
      id: item.id.toString(),
      codigo: item.codigo,
      nombre: item.nombre,
      direccion: item.direccion ?? '',
      responsable: item.responsable
        ? `${item.responsable.nombres} ${item.responsable.apellidos}`
        : 'Sin responsable',
      productos: new Set(item.stocks.map((stock) => stock.productoId.toString())).size,
      unidades: item.stocks.reduce((sum, stock) => sum + Number(stock.cantidad), 0),
      activo: item.estado,
    }));
  }

  async createWarehouse(dto: CreateOperationalWarehouseDto, actor: AuthUser, unidad?: string) {
    // El almacén nace en la unidad que se está mirando, no en la de quien lo crea: un admin
    // parado en un puesto satélite está armando el almacén de ESE puesto.
    const unidadNegocioId = await resolverUnidadDeEscritura(this.prisma, {
      actor,
      unidadSolicitada: unidad,
    });
    const codigo = await nextSequentialCode('ALM', async () => {
      const ultimo = await this.prisma.almacen.findFirst({
        where: { codigo: { startsWith: 'ALM-' } },
        orderBy: { codigo: 'desc' },
        select: { codigo: true },
      });
      return ultimo?.codigo ?? null;
    });
    const warehouse = await this.prisma.almacen.create({
      data: {
        unidadNegocioId,
        codigo,
        nombre: dto.nombre.trim(),
        direccion: dto.direccion?.trim() || null,
      },
    });
    return {
      id: warehouse.id.toString(),
      codigo: warehouse.codigo,
      nombre: warehouse.nombre,
      direccion: warehouse.direccion ?? '',
      activo: warehouse.estado,
    };
  }

  async deleteProduct(id: string) {
    let productId: bigint;
    try {
      productId = BigInt(id);
    } catch {
      throw new NotFoundException('Producto no encontrado');
    }
    const product = await this.prisma.producto.findUnique({
      where: { id: productId },
      select: { _count: { select: { detallesVenta: true } } },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (product._count.detallesVenta > 0) {
      throw new BadRequestException('No se puede eliminar un producto ligado a una venta');
    }
    await this.prisma.producto.delete({ where: { id: productId } });
    return { message: 'Producto eliminado' };
  }

  async sale(id: string, actor: AuthUser, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    return this.saleView(await this.findSale(this.prisma, BigInt(id), alcance));
  }

  async sales(actor: AuthUser, from?: string, to?: string, trabajadorId?: string, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const range = this.listDateRange(from, to);
    const rows = await this.prisma.venta.findMany({
      where: {
        ...filtroUnidad(alcance),
        ...(range ? { fecha: range } : {}),
        ...(trabajadorId ? { trabajadorId: BigInt(trabajadorId) } : {}),
      },
      orderBy: { fecha: 'desc' },
      take: 1000,
      include: {
        cliente: true,
        almacenOrigen: true,
        trabajador: true,
        detalles: {
          include: {
            producto: true,
            detallesDevolucion: { where: { devolucionVenta: { estado: 'CONFIRMADA' } } },
          },
        },
        cuentaCobrar: true,
        devoluciones: true,
        movimientosInventario: { orderBy: { id: 'asc' } },
      },
    });
    return rows.map((row) => this.saleView(row));
  }

  async stock(actor: AuthUser, almacenId?: string, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    // `stock_almacen` no lleva la unidad: la hereda de su almacén.
    const rows = await this.prisma.stockAlmacen.findMany({
      where: {
        ...filtroUnidadPor('almacen', alcance),
        ...(almacenId ? { almacenId: BigInt(almacenId) } : {}),
      },
      orderBy: [{ almacen: { nombre: 'asc' } }, { producto: { nombre: 'asc' } }],
      include: {
        producto: { include: { tipoProducto: true } },
        almacen: true,
        lote: true,
        estadoInventario: true,
      },
    });
    return rows.map((row) => ({
      id: row.id.toString(),
      producto: row.producto.nombre,
      codigo: row.producto.codigo,
      categoria: row.producto.tipoProducto.nombre,
      almacen: row.almacen.nombre,
      lote: row.lote?.codigoLote ?? 'Sin lote',
      estado: row.estadoInventario.codigo,
      vendible: row.estadoInventario.estado && row.estadoInventario.permiteVenta,
      cantidad: Number(row.cantidad),
      reservada: Number(row.cantidadReservada),
      minimo: Number(row.stockMinimo),
      costo: Number(row.costoPromedio),
    }));
  }

  /**
   * Métodos que puede usar un trabajador al cobrar: los globales (Efectivo) más los suyos
   * (su Yape). Nunca los de otro repartidor. El admin puede pedir los de otro pasando
   * `trabajadorId`, para registrar una venta a nombre de él.
   */
  async paymentMethods(actor: AuthUser, trabajadorId?: string) {
    const efectivo = await resolverTrabajadorAutor(this.prisma, actor, trabajadorId);
    const rows = await this.prisma.metodoPago.findMany({
      where: {
        estado: true,
        categoria: { estado: true },
        OR: [{ trabajadorId: null }, { trabajadorId: efectivo }],
      },
      include: { categoria: true },
      orderBy: [{ categoria: { nombre: 'asc' } }, { referencia: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id.toString(),
      // Se mantiene el campo `nombre` con la etiqueta ya armada para no cambiar la forma
      // que consumen el formulario de venta y el modal de cobro.
      nombre: etiquetaMetodoPago(row),
      categoria: row.categoria?.nombre ?? null,
      referencia: row.referencia,
      propio: row.trabajadorId !== null,
    }));
  }

  /** Categorías activas para el combo "+ Agregar método de pago" de venta y cobro. */
  async paymentMethodCategories() {
    const categorias = await this.paymentMethodsService.categories();
    return categorias.filter((categoria) => categoria.estado);
  }

  /**
   * Alta de un método de pago desde los combos de venta y cobro. Cualquier operador puede
   * usarlo, pero el método queda siempre a su propio nombre: `resolverTrabajadorAutor`
   * ignora un `trabajadorId` ajeno salvo que quien registra sea ADMIN.
   */
  async createOwnPaymentMethod(actor: AuthUser, dto: CreateOwnPaymentMethodDto) {
    const trabajadorId = await resolverTrabajadorAutor(this.prisma, actor, dto.trabajadorId);
    return this.paymentMethodsService.create({
      categoriaId: dto.categoriaId,
      referencia: dto.referencia,
      nombre: dto.nombre,
      trabajadorId: trabajadorId.toString(),
    });
  }

  async accounts(actor: AuthUser, clienteId?: string, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const rows = await this.prisma.cuentaCobrar.findMany({
      where: {
        ...filtroUnidadPor('cliente', alcance),
        ...(clienteId ? { clienteId: BigInt(clienteId) } : {}),
      },
      orderBy: { fechaEmision: 'desc' },
      // Antes no tenía tope. Con el consolidado la cartera de varias unidades se junta en
      // una sola consulta, así que conviene acotarla como el resto de los listados.
      take: 1000,
      include: {
        cliente: true,
        venta: true,
        pagos: {
          orderBy: { fechaPago: 'desc' },
          include: { metodoPago: true, trabajador: true },
        },
      },
    });
    return rows.map((row) => this.receivableView(row));
  }

  async registerAccountPayment(
    dto: RegisterOperationalPaymentDto,
    actor: AuthUser,
    unidadActiva?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const workerId = await resolverTrabajadorAutor(tx, actor, dto.trabajadorId);
      const method = await tx.metodoPago.findUnique({
        where: { id: BigInt(dto.metodoPagoId) },
        include: { categoria: true },
      });
      if (!method || !method.estado || method.categoria?.estado === false)
        throw new BadRequestException('El método de pago no está disponible');
      if (method.trabajadorId !== null && method.trabajadorId !== workerId)
        throw new BadRequestException(
          `El método ${etiquetaMetodoPago(method)} pertenece a otro trabajador`,
        );
      if (dto.fechaPago && dto.fechaPago.slice(0, 10) > limaTodayKey())
        throw new BadRequestException('La fecha del pago no puede estar en el futuro');
      const paidAt = dto.fechaPago ? new Date(dto.fechaPago) : new Date();

      const unidad = await resolverUnidadDeEscritura(tx, {
        actor,
        unidadSolicitada: unidadActiva,
        atribuidaA: dto.trabajadorId ? workerId : null,
      });
      await exigirMismaUnidad(tx, unidad, { cuentaCobrarId: BigInt(dto.cuentaId) });
      const account = await tx.cuentaCobrar.findUnique({ where: { id: BigInt(dto.cuentaId) } });
      if (!account) throw new NotFoundException('Cuenta por cobrar no encontrada');
      const balance = Number(account.saldoPendiente);
      if (balance <= 0) throw new BadRequestException('La cuenta ya está pagada');
      if (dto.monto > balance) throw new BadRequestException('El pago supera el saldo pendiente');
      const newBalance = Math.max(balance - dto.monto, 0);
      await tx.pagoCliente.create({
        data: {
          cuentaCobrarId: account.id,
          metodoPagoId: method.id,
          trabajadorId: workerId,
          fechaPago: paidAt,
          monto: dto.monto,
          observaciones: dto.observaciones?.trim(),
        },
      });
      await tx.cuentaCobrar.update({
        where: { id: account.id },
        data: {
          montoPagado: Number(account.montoPagado) + dto.monto,
          saldoPendiente: newBalance,
          estado: newBalance <= 0 ? 'PAGADA' : 'PARCIAL',
        },
      });
      await tx.venta.update({
        where: { id: account.ventaId },
        data: { estadoPago: newBalance <= 0 ? 'PAGADA' : 'PARCIAL' },
      });

      return this.cuentaCobrarActualizada(tx, account.id);
    });
  }

  async updateReceivableDueDate(
    id: string,
    dto: UpdateReceivableDueDateDto,
    actor: AuthUser,
    unidadActiva?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const unidad = await resolverUnidadDeEscritura(tx, {
        actor,
        unidadSolicitada: unidadActiva,
      });
      await exigirMismaUnidad(tx, unidad, { cuentaCobrarId: BigInt(id) });
      const account = await tx.cuentaCobrar.findUnique({ where: { id: BigInt(id) } });
      if (!account) throw new NotFoundException('Cuenta por cobrar no encontrada');
      if (Number(account.saldoPendiente) <= 0)
        throw new BadRequestException(
          'La cuenta ya está pagada; no tiene vencimiento por programar',
        );

      const dueKey = dto.fechaVencimiento.slice(0, 10);
      if (dueKey < limaTodayKey())
        throw new BadRequestException('La fecha de vencimiento no puede estar en el pasado');
      const dueDate = new Date(`${dueKey}T00:00:00.000Z`);

      await tx.cuentaCobrar.update({
        where: { id: account.id },
        data: { fechaVencimiento: dueDate },
      });
      await tx.venta.update({
        where: { id: account.ventaId },
        data: { fechaVencimientoPago: dueDate },
      });

      return this.cuentaCobrarActualizada(tx, account.id);
    });
  }

  async returns(actor: AuthUser, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const [sales, clientCredits] = await Promise.all([
      // Ni la devolución ni el saldo a favor llevan la unidad: la heredan de la venta y del
      // cliente respectivamente.
      this.prisma.devolucionVenta.findMany({
        where: filtroUnidadPor('venta', alcance),
        orderBy: { fecha: 'desc' },
        include: {
          venta: { include: { cliente: true } },
          detalles: { include: { producto: true, estadoDestino: true } },
          movimientosInventario: { orderBy: { id: 'asc' } },
          saldosFavor: true,
        },
      }),
      this.prisma.saldoFavorCliente.findMany({
        where: { montoDisponible: { gt: 0 }, ...filtroUnidadPor('cliente', alcance) },
        include: { cliente: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      devoluciones: sales
        .map((row) => this.devolucionView(row))
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
      saldosFavor: clientCredits.map((row) => ({
        id: `C-${row.id}`,
        tipo: 'CLIENTE',
        tercero: row.cliente.nombreLegal,
        original: Number(row.montoOriginal),
        disponible: Number(row.montoDisponible),
        estado: row.estado,
        fecha: row.createdAt,
      })),
    };
  }

  async createReturn(type: string, dto: CreateReturnDto, actor: AuthUser, unidadActiva?: string) {
    if (type !== 'venta') throw new BadRequestException('Tipo de devolución inválido');
    const id = await this.prisma.$transaction(async (tx) => {
      const workerId = await resolverTrabajadorAutor(tx, actor, dto.trabajadorId);
      const unidad = await resolverUnidadDeEscritura(tx, {
        actor,
        unidadSolicitada: unidadActiva,
        atribuidaA: dto.trabajadorId ? workerId : null,
      });
      await exigirMismaUnidad(tx, unidad, { ventaId: BigInt(dto.operacionId) });
      return this.createSaleReturnTx(tx, dto, workerId);
    });
    // Se devuelve solo la devolución recién creada. Antes se recargaba la lista completa
    // (todas las devoluciones y todos los saldos a favor) para quedarse con una sola.
    const creada = await this.prisma.devolucionVenta.findUniqueOrThrow({
      where: { id },
      include: {
        venta: { include: { cliente: true } },
        detalles: { include: { producto: true, estadoDestino: true } },
        movimientosInventario: { orderBy: { id: 'asc' } },
        saldosFavor: true,
      },
    });
    return this.devolucionView(creada);
  }

  /** Cómo se ve una devolución de venta para el frontend. */
  private devolucionView(row: any) {
    return {
      id: row.id.toString(),
      codigo: row.codigo,
      tipo: 'VENTA',
      fecha: row.fecha,
      operacionId: row.ventaId.toString(),
      comprobante: saleCode(row.venta.id),
      tercero: row.venta.cliente.nombreLegal,
      motivo: row.motivo,
      total: Number(row.total),
      estado: row.estado,
      kardexId: row.movimientosInventario[0]?.id?.toString() ?? null,
      kardexRef: row.movimientosInventario[0]?.numeroReferencia ?? null,
      saldoFavor: row.saldosFavor.reduce(
        (sum: number, credit: any) => sum + Number(credit.montoOriginal),
        0,
      ),
      items: row.detalles.map((item: any) => ({
        producto: item.producto.nombre,
        cantidad: Number(item.cantidad),
        importe: Number(item.subtotal),
        destino: item.reintegraInventario ? item.estadoDestino.nombre : 'No retorna al inventario',
      })),
    };
  }

  private static readonly MOVEMENTS_INCLUDE = {
    almacenOrigen: true,
    almacenDestino: true,
    trabajador: true,
    venta: { include: { cliente: true } },
    ordenProduccion: { include: { producto: true } },
    detalles: {
      include: { producto: true, almacen: true, lote: true, estadoInventario: true },
    },
  } as const;

  private movementView(row: any) {
    // Los movimientos históricos de tipo COMPRA/DEVOLUCION_COMPRA (del módulo de Compras, ya
    // eliminado) se conservan como registro de kardex, pero sin el detalle de a qué compra
    // pertenecían (esa tabla ya no existe) — solo se identifican por su tipoOperacion.
    const document = row.venta
      ? `Venta ${saleCode(row.venta.id)}`
      : row.ordenProduccion
        ? `ORDEN ${row.ordenProduccion.codigo}`
        : (row.numeroReferencia ?? 'Movimiento manual');
    const thirdParty =
      row.venta?.cliente.nombreLegal ??
      (row.ordenProduccion
        ? `Producción · ${row.ordenProduccion.producto.nombre}`
        : 'Movimiento interno');
    const origin = row.almacenOrigen?.nombre ?? 'Origen externo';
    const destination =
      row.almacenDestino?.nombre ?? (row.venta ? `Cliente · ${thirdParty}` : 'Destino externo');
    const units = row.detalles
      .filter((item: any) => row.tipoMovimiento !== 'PRODUCCION' || item.direccion === 'ENTRADA')
      .reduce((sum: number, item: any) => sum + Number(item.cantidad), 0);
    // Una ENTRADA ligada a una venta solo puede ser la reversión de esa venta al editarla;
    // sin este caso el kardex decía "Ingresaron 10 unidades por una salida por venta".
    const esReversionDeVenta = row.tipoMovimiento === 'ENTRADA' && row.tipoOperacion === 'VENTA';
    const explanation =
      row.tipoMovimiento === 'PRODUCCION'
        ? `Se consumieron insumos y se generaron ${units} unidades de producto terminado.`
        : esReversionDeVenta
          ? `Volvieron ${units} unidades al inventario porque se editó la venta.`
          : row.tipoMovimiento === 'ENTRADA'
            ? `Ingresaron ${units} unidades al inventario por una ${movementLabel(
                row.tipoOperacion,
              ).toLowerCase()}.`
            : row.tipoMovimiento === 'SALIDA'
              ? `Salieron ${units} unidades del inventario por una ${movementLabel(
                  row.tipoOperacion,
                ).toLowerCase()}.`
              : `Se trasladaron ${units} unidades entre ubicaciones.`;
    return {
      id: row.id.toString(),
      referencia: row.numeroReferencia ?? `MOV-${row.id.toString().padStart(6, '0')}`,
      fecha: row.fecha,
      tipo: row.tipoMovimiento,
      operacion: row.tipoOperacion,
      operacionLabel: movementLabel(row.tipoOperacion),
      comprobante: document,
      tercero: thirdParty,
      explicacion: explanation,
      observaciones: row.observaciones,
      responsable: `${row.trabajador.nombres} ${row.trabajador.apellidos}`,
      origen: origin,
      destino: destination,
      estado: row.estado,
      unidades: units,
      detalles: row.detalles.map((item: any) => ({
        productoId: item.productoId.toString(),
        producto: item.producto.nombre,
        codigo: item.producto.codigo,
        almacenId: item.almacenId.toString(),
        almacen: item.almacen.nombre,
        lote: item.lote?.codigoLote ?? 'Sin lote',
        estadoInventario: item.estadoInventario.nombre,
        direccion: item.direccion,
        cantidad: Number(item.cantidad),
        costoUnitario: Number(item.costoUnitario),
        costoTotal: Number(item.costoTotal),
        saldoAnterior: Number(item.saldoAnterior),
        saldoPosterior: Number(item.saldoPosterior),
      })),
    };
  }

  async movements(actor: AuthUser, filters: MovementsFilter = {}, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const fecha = this.listDateRange(filters.from, filters.to);
    // `movimiento_inventario` tampoco lleva la unidad: se filtra por el almacén de sus
    // detalles. Salvo en el consolidado, el `some` ahora se construye siempre.
    const detalleFilter: Prisma.DetalleMovimientoInventarioWhereInput = {
      ...filtroUnidadPor('almacen', alcance),
    };
    if (filters.productoId) detalleFilter.productoId = BigInt(filters.productoId);
    if (filters.almacenId) detalleFilter.almacenId = BigInt(filters.almacenId);
    const where: Prisma.MovimientoInventarioWhereInput = {
      ...(fecha ? { fecha } : {}),
      ...(filters.tipoOperacion ? { tipoOperacion: filters.tipoOperacion } : {}),
      ...(filters.ref ? { numeroReferencia: { contains: filters.ref, mode: 'insensitive' } } : {}),
      ...(Object.keys(detalleFilter).length ? { detalles: { some: detalleFilter } } : {}),
    };
    const rows = await this.prisma.movimientoInventario.findMany({
      where,
      orderBy: { fecha: 'desc' },
      take: 300,
      include: OperationsService.MOVEMENTS_INCLUDE,
    });
    return rows.map((row) => this.movementView(row));
  }

  /**
   * Kardex por producto ("Registro de inventario permanente"): todas las líneas de movimiento de
   * un producto en orden cronológico, con el saldo acumulado. A diferencia de los campos guardados
   * `saldoAnterior/saldoPosterior` (que son por producto+almacén+lote+estado), acá el saldo se
   * recalcula sobre el filtro pedido para que se lea como una sola columna continua.
   */
  async kardex(
    actor: AuthUser,
    filters: { productoId?: string; almacenId?: string; from?: string; to?: string },
    unidad?: string,
  ) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    if (!filters.productoId) throw new BadRequestException('Seleccione un producto para el kardex');
    const productoId = BigInt(filters.productoId);
    const almacenId = filters.almacenId ? BigInt(filters.almacenId) : undefined;
    const producto = await this.prisma.producto.findUnique({ where: { id: productoId } });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    const almacen = almacenId
      ? await this.prisma.almacen.findUnique({ where: { id: almacenId } })
      : null;
    const fecha = this.listDateRange(filters.from, filters.to);

    const scopeFilter: Prisma.DetalleMovimientoInventarioWhereInput = {
      productoId,
      ...filtroUnidadPor('almacen', alcance),
      ...(almacenId ? { almacenId } : {}),
    };
    const saldoInicial = fecha?.gte ? await this.kardexSaldoInicial(scopeFilter, fecha.gte) : 0;

    const lines = await this.prisma.detalleMovimientoInventario.findMany({
      where: { ...scopeFilter, ...(fecha ? { movimiento: { fecha } } : {}) },
      orderBy: [{ movimiento: { fecha: 'asc' } }, { id: 'asc' }],
      include: {
        almacen: true,
        lote: true,
        estadoInventario: true,
        movimiento: { include: OperationsService.MOVEMENTS_INCLUDE },
      },
    });

    let saldo = saldoInicial;
    const movimientos = lines.map((line) => {
      const view = this.movementView(line.movimiento);
      const cantidad = Number(line.cantidad);
      const isEntry = line.direccion === 'ENTRADA';
      saldo += isEntry ? cantidad : -cantidad;
      return {
        detalleId: line.id.toString(),
        movimientoId: line.movimientoId.toString(),
        fecha: line.movimiento.fecha,
        referencia: view.referencia,
        documento: view.comprobante,
        operacion: view.operacion,
        operacionLabel: view.operacionLabel,
        tercero: view.tercero,
        direccion: line.direccion,
        entrada: isEntry ? cantidad : 0,
        salida: isEntry ? 0 : cantidad,
        saldo,
        costoUnitario: Number(line.costoUnitario),
        costoTotal: Number(line.costoTotal),
        lote: line.lote?.codigoLote ?? 'Sin lote',
        almacen: line.almacen.nombre,
        estadoInventario: line.estadoInventario.nombre,
      };
    });

    return {
      producto: {
        id: producto.id.toString(),
        nombre: producto.nombre,
        codigo: producto.codigo,
      },
      almacen: almacen?.nombre ?? 'Todos los almacenes',
      saldoInicial,
      saldoFinal: saldo,
      movimientos,
    };
  }

  /** Suma de entradas menos salidas anteriores a `before` para ese producto/almacén. */
  private async kardexSaldoInicial(
    scopeFilter: Prisma.DetalleMovimientoInventarioWhereInput,
    before: Date,
  ) {
    const grupos = await this.prisma.detalleMovimientoInventario.groupBy({
      by: ['direccion'],
      where: { ...scopeFilter, movimiento: { fecha: { lt: before } } },
      _sum: { cantidad: true },
    });
    return grupos.reduce(
      (sum, row) => sum + (row.direccion === 'ENTRADA' ? 1 : -1) * Number(row._sum.cantidad ?? 0),
      0,
    );
  }

  /**
   * Comprueba que todos los productos de la venta existan, en UNA sola consulta.
   *
   * La venta ya no elige lote: el lote lo decide el sistema al descontar el stock, tomando
   * siempre primero el más antiguo (ver `saleableStockRows`). Por eso acá solo se validan
   * los productos.
   */
  private async validarProductosDeVenta(
    tx: Transaction,
    items: { productoId: number }[],
  ): Promise<void> {
    const productoIds = [...new Set(items.map((item) => BigInt(item.productoId)))];
    const encontrados = await tx.producto.count({ where: { id: { in: productoIds } } });
    if (encontrados !== productoIds.length)
      throw new BadRequestException('Alguno de los productos de la venta ya no existe');
  }

  // Registrar una venta es un solo paso: nace ya CONFIRMADA (descuenta stock y genera kardex
  // + cuenta por cobrar de inmediato), sin un estado intermedio BORRADOR que requiera una
  // confirmación aparte — mismo patrón que ya se usa en ProductionService.create().
  async createSale(dto: CreateOperationalSaleDto, actor: AuthUser, unidadActiva?: string) {
    return this.prisma.$transaction(async (tx) => {
      const trabajadorId = await resolverTrabajadorAutor(tx, actor, dto.trabajadorId);
      // La unidad sale de la que está elegida —la misma con la que se armaron los combos en
      // `catalogs()`—, no del trabajador que la teclea. Cuando el admin la registra a nombre
      // de otro, se exige además que ese trabajador sea de esta unidad.
      const unidadNegocioId = await resolverUnidadDeEscritura(tx, {
        actor,
        unidadSolicitada: unidadActiva,
        atribuidaA: dto.trabajadorId ? trabajadorId : null,
      });
      const controlaInventario = await unidadControlaInventario(tx, unidadNegocioId);
      const warehouse = dto.almacenId
        ? await tx.almacen.findUnique({ where: { id: BigInt(dto.almacenId) } })
        : // El fallback tiene que estar acotado a la unidad. Sin el filtro, una venta sin
          // almacén explícito descontaría del primer almacén activo de la base, que casi
          // siempre es el de la Principal.
          await tx.almacen.findFirst({
            where: { estado: true, unidadNegocioId },
            orderBy: { id: 'asc' },
          });
      if (!warehouse || !warehouse.estado)
        throw new BadRequestException('No existe un almacén activo para registrar la venta');
      // El cliente y el almacén llegan del formulario: nada garantiza que sean de esta
      // unidad hasta que se comprueba.
      await exigirMismaUnidad(tx, unidadNegocioId, {
        clienteId: BigInt(dto.clienteId),
        almacenId: warehouse.id,
      });
      const totals = this.totals(dto.items, dto.descuento, false);
      const terms = await this.paymentTerms(tx, dto, totals.total, trabajadorId);
      await this.validarProductosDeVenta(tx, dto.items);
      const sale = await tx.venta.create({
        data: {
          unidadNegocioId,
          clienteId: BigInt(dto.clienteId),
          almacenOrigenId: warehouse.id,
          trabajadorId,
          tipoPago: dto.tipoPago,
          // Referencia rápida al método principal; el desglose real vive en PagoCliente.
          metodoPagoInicialId: terms.payments[0]?.methodId ?? null,
          montoInicial: terms.initial,
          fechaVencimientoPago: terms.dueDate,
          estado: 'CONFIRMADA',
          subtotal: totals.subtotal,
          igv: totals.igv,
          descuento: totals.descuento,
          total: totals.total,
          detalles: {
            create: dto.items.map((item) => ({
              productoId: BigInt(item.productoId),
              // El lote lo asigna el descuento de stock (FIFO), no el formulario.
              loteId: null,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              descuento: item.descuento ?? 0,
              subtotal: this.lineTotal(item),
            })),
          },
        },
      });
      // En un puesto que solo registra ventas y gastos no hay stock que descontar ni kardex que
      // escribir: la venta queda igual de completa (cuenta por cobrar, cobros, reportes), solo
      // que sin su contrapartida física.
      if (controlaInventario) await this.applySaleOutbound(tx, sale.id);
      const account = await tx.cuentaCobrar.create({
        data: {
          ventaId: sale.id,
          clienteId: sale.clienteId,
          montoOriginal: sale.total,
          saldoPendiente: sale.total,
          fechaEmision: sale.fecha,
          fechaVencimiento: sale.fechaVencimientoPago,
          estado: 'PENDIENTE',
        },
      });
      await this.applyInitialPayments(
        tx,
        { id: account.id, montoOriginal: Number(account.montoOriginal) },
        sale.trabajadorId,
        terms.payments,
      );
      const paymentState =
        terms.initial >= Number(sale.total) - 0.005
          ? 'PAGADA'
          : terms.initial > 0
            ? 'PARCIAL'
            : 'PENDIENTE';
      await tx.venta.update({ where: { id: sale.id }, data: { estadoPago: paymentState } });
      return this.saleView(await this.findSale(tx, sale.id));
    }, TRANSACCION_DE_STOCK);
  }

  /**
   * Edita una venta ya confirmada. Como una venta nace confirmada (no hay estado BORRADOR),
   * editar significa revertir el efecto físico del movimiento de salida original y volver a
   * aplicarlo con los datos nuevos — sin mutar ni borrar el kardex histórico (es un ledger de
   * solo-append).
   *
   * Se puede editar mientras el único cobro que tenga sea el automático que registra la propia
   * venta (una venta al contado nace cobrada, y aun así se debe poder corregir). Lo que sí
   * bloquea la edición es un cobro hecho después desde Cobranzas o una devolución confirmada:
   * cambiar el total ahí dejaría descuadrada la cuenta del cliente.
   */
  async updateSale(
    id: string,
    dto: UpdateOperationalSaleDto,
    actor: AuthUser,
    unidadActiva?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const saleId = BigInt(id);
      // Con la unidad activa: sin ella, un admin parado en un puesto satélite recibía "Venta
      // no encontrada" al corregir una venta de ese puesto.
      const alcance = await resolverAlcanceUnidad(tx, actor, unidadActiva);
      const sale = await tx.venta.findFirst({
        where: { id: saleId, ...filtroUnidad(alcance) },
        include: { cuentaCobrar: true, devoluciones: true },
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      // Solo un admin puede corregir a quién se le atribuye la venta; si no viene nada en el
      // DTO se conserva el vendedor original (editar no debe robarle la venta a quien la hizo).
      const trabajadorId = dto.trabajadorId
        ? await resolverTrabajadorAutor(tx, actor, dto.trabajadorId)
        : sale.trabajadorId;
      // La venta NO cambia de unidad al editarla. Mudarla arrastraría su cliente, su
      // almacén y su kardex, que siguen siendo de la unidad original: quedaría inconsistente.
      // Un gasto sí se puede reasignar (es solo un monto); una venta, no.
      if (dto.trabajadorId) {
        const nuevoAutor = await tx.trabajador.findFirst({
          where: { id: trabajadorId },
          select: { unidadNegocioId: true },
        });
        if (nuevoAutor?.unidadNegocioId !== sale.unidadNegocioId)
          throw new BadRequestException(
            'No se puede reasignar la venta a un trabajador de otra unidad de negocio',
          );
      }
      // El medio centavo de margen evita que un redondeo del decimal marque falso positivo.
      const cobrado = Number(sale.cuentaCobrar?.montoPagado ?? 0);
      if (cobrado > Number(sale.montoInicial) + 0.005)
        throw new BadRequestException(
          'No se puede editar una venta con cobros registrados desde Cobranzas',
        );
      if (sale.devoluciones.some((item) => item.estado === 'CONFIRMADA'))
        throw new BadRequestException('No se puede editar una venta con devoluciones registradas');

      // La bandera se lee de la unidad DE LA VENTA, no de la activa: una venta nunca cambia de
      // unidad, así que editarla tiene que comportarse igual que cuando nació. Con la unidad
      // activa, un admin en "Todo consolidado" la editaría con la semántica equivocada.
      const controlaInventario = await unidadControlaInventario(tx, sale.unidadNegocioId);

      // La fecha de emisión se puede corregir al editar. No puede quedar en el futuro (Lima).
      // Se guarda a mediodía Lima para que los listados que agrupan por día no se corran de fecha;
      // la cuenta por cobrar la guarda como fecha calendario (columna Date).
      let nuevaFecha: { emision: Date; venta: Date } | null = null;
      if (dto.fecha) {
        const fechaKey = dto.fecha.slice(0, 10);
        if (fechaKey > limaTodayKey())
          throw new BadRequestException('La fecha de la venta no puede estar en el futuro');
        nuevaFecha = {
          emision: new Date(`${fechaKey}T00:00:00.000Z`),
          venta: new Date(`${fechaKey}T12:00:00-05:00`),
        };
      }

      // El cobro automático se rehace más abajo con el total nuevo, así que se borra el viejo.
      // Solo puede ser ese: los cobros de Cobranzas ya cortaron la edición arriba.
      if (sale.cuentaCobrar)
        await tx.pagoCliente.deleteMany({ where: { cuentaCobrarId: sale.cuentaCobrar.id } });

      // El gateo va acá afuera y NO adentro de `reverseSaleOutbound`: ese método tiene que
      // seguir fallando cuando una venta con inventario no tiene movimiento, porque es lo que
      // impide que al editar una venta vieja se descuente stock que nunca se descontó.
      if (controlaInventario) await this.reverseSaleOutbound(tx, saleId);

      const warehouse = dto.almacenId
        ? await tx.almacen.findUnique({ where: { id: BigInt(dto.almacenId) } })
        : await tx.almacen.findUnique({ where: { id: sale.almacenOrigenId } });
      if (!warehouse || !warehouse.estado)
        throw new BadRequestException('No existe un almacén activo para registrar la venta');
      // El DTO permite cambiar cliente y almacén, así que hay que revalidarlos: si no, una
      // venta se editaría para apuntar al almacén de otra unidad y descontarle stock real.
      await exigirMismaUnidad(tx, sale.unidadNegocioId, {
        clienteId: BigInt(dto.clienteId),
        almacenId: warehouse.id,
      });
      const totals = this.totals(dto.items, dto.descuento, false);
      const terms = await this.paymentTerms(tx, dto, totals.total, trabajadorId);
      await this.validarProductosDeVenta(tx, dto.items);
      await tx.venta.update({
        where: { id: saleId },
        data: {
          clienteId: BigInt(dto.clienteId),
          almacenOrigenId: warehouse.id,
          trabajadorId,
          tipoPago: dto.tipoPago,
          ...(nuevaFecha ? { fecha: nuevaFecha.venta } : {}),
          // Referencia rápida al método principal; el desglose real vive en PagoCliente.
          metodoPagoInicialId: terms.payments[0]?.methodId ?? null,
          montoInicial: terms.initial,
          fechaVencimientoPago: terms.dueDate,
          subtotal: totals.subtotal,
          igv: totals.igv,
          descuento: totals.descuento,
          total: totals.total,
          detalles: {
            deleteMany: {},
            create: dto.items.map((item) => ({
              productoId: BigInt(item.productoId),
              // El lote lo asigna el descuento de stock (FIFO), no el formulario.
              loteId: null,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              descuento: item.descuento ?? 0,
              subtotal: this.lineTotal(item),
            })),
          },
        },
      });

      if (controlaInventario) await this.applySaleOutbound(tx, saleId, '-R');

      // La cuenta por cobrar se rearma desde cero con el total nuevo: se borró el cobro viejo,
      // así que parte en 0 pagado y se vuelve a registrar el cobro inicial que corresponda al
      // tipo de pago nuevo. También se actualiza el vencimiento, porque Cobranzas lo lee de
      // acá y no de la venta: sin esto la venta seguía apareciendo vencida al reprogramarla.
      if (sale.cuentaCobrar) {
        await tx.cuentaCobrar.update({
          where: { id: sale.cuentaCobrar.id },
          data: {
            montoOriginal: totals.total,
            montoPagado: 0,
            saldoPendiente: totals.total,
            fechaVencimiento: terms.dueDate,
            ...(nuevaFecha ? { fechaEmision: nuevaFecha.emision } : {}),
            estado: 'PENDIENTE',
          },
        });
        // Los cobros se recrean a nombre del trabajador vigente. El kardex no: los
        // `MovimientoInventario` ya escritos son historia y no se reescriben.
        await this.applyInitialPayments(
          tx,
          { id: sale.cuentaCobrar.id, montoOriginal: totals.total },
          trabajadorId,
          terms.payments,
        );
        const estadoPago =
          terms.initial >= totals.total - 0.005
            ? 'PAGADA'
            : terms.initial > 0
              ? 'PARCIAL'
              : 'PENDIENTE';
        await tx.venta.update({ where: { id: saleId }, data: { estadoPago } });
      }

      return this.saleView(await this.findSale(tx, saleId));
    }, TRANSACCION_DE_STOCK);
  }

  /** Descuenta stock según las líneas actuales de la venta y registra el movimiento de salida. */
  private async applySaleOutbound(tx: Transaction, id: bigint, referenceSuffix = '') {
    const sale = await this.findSale(tx, id);
    const movement = await tx.movimientoInventario.create({
      data: {
        tipoMovimiento: 'SALIDA',
        tipoOperacion: 'VENTA',
        almacenOrigenId: sale.almacenOrigenId,
        ventaId: sale.id,
        trabajadorId: sale.trabajadorId,
        estado: 'CONFIRMADO',
        numeroReferencia: `VEN-${sale.id.toString().padStart(6, '0')}${referenceSuffix}`,
        observaciones: referenceSuffix
          ? `Salida por edición de venta ${saleCode(sale.id)}`
          : `Salida automática por venta ${saleCode(sale.id)}`,
      },
    });
    for (const item of sale.detalles) {
      const stocks = await this.saleableStockRows(
        tx,
        item.productoId,
        sale.almacenOrigenId,
        item.loteId,
      );
      const free = stocks.reduce(
        (total, stock) =>
          total + Math.max(Number(stock.cantidad) - Number(stock.cantidadReservada), 0),
        0,
      );
      if (free < Number(item.cantidad)) {
        throw new BadRequestException(
          `Stock insuficiente para ${item.producto.nombre}. Disponible: ${free}`,
        );
      }
      let remaining = Number(item.cantidad);
      for (const stock of stocks) {
        const previous = Number(stock.cantidad);
        const take = Math.min(Math.max(previous - Number(stock.cantidadReservada), 0), remaining);
        if (take <= 0) continue;
        const next = previous - take;
        await tx.stockAlmacen.update({ where: { id: stock.id }, data: { cantidad: next } });
        await tx.detalleMovimientoInventario.create({
          data: {
            movimientoId: movement.id,
            productoId: item.productoId,
            almacenId: sale.almacenOrigenId,
            loteId: stock.loteId,
            estadoInventarioId: stock.estadoInventarioId,
            direccion: 'SALIDA',
            cantidad: take,
            costoUnitario: stock.costoPromedio,
            costoTotal: take * Number(stock.costoPromedio),
            saldoAnterior: previous,
            saldoPosterior: next,
          },
        });
        remaining -= take;
        if (remaining <= 0) break;
      }
    }
  }

  /**
   * Revierte el efecto físico del último movimiento de salida confirmado de una venta:
   * repone el stock exacto que se descontó y deja un nuevo movimiento de entrada como
   * constancia — el kardex es un ledger de solo-append, nunca se borra ni se muta un
   * movimiento ya existente (mismo criterio que ya usan las devoluciones).
   */
  private async reverseSaleOutbound(tx: Transaction, saleId: bigint) {
    const sale = await tx.venta.findUniqueOrThrow({ where: { id: saleId } });
    const outbound = await tx.movimientoInventario.findFirst({
      where: {
        ventaId: saleId,
        tipoOperacion: 'VENTA',
        tipoMovimiento: 'SALIDA',
        estado: 'CONFIRMADO',
      },
      orderBy: { id: 'desc' },
      include: { detalles: true },
    });
    // Sin movimiento de salida no hay nada que revertir, y seguir adelante descontaría el
    // stock una segunda vez. Se corta acá con un mensaje claro (pasa con ventas viejas,
    // anteriores a este flujo).
    if (!outbound)
      throw new BadRequestException(
        'Esta venta no tiene movimiento de inventario registrado, así que no se puede editar.',
      );
    const reversal = await tx.movimientoInventario.create({
      data: {
        tipoMovimiento: 'ENTRADA',
        tipoOperacion: 'VENTA',
        almacenDestinoId: sale.almacenOrigenId,
        ventaId: saleId,
        trabajadorId: sale.trabajadorId,
        estado: 'CONFIRMADO',
        numeroReferencia: `VEN-${saleId.toString().padStart(6, '0')}-REV`,
        observaciones: `Reversión por edición de venta ${saleCode(saleId)}`,
      },
    });
    for (const line of outbound.detalles) {
      const stock = await this.stockRow(
        tx,
        line.productoId,
        line.almacenId,
        line.loteId,
        line.estadoInventarioId,
      );
      const previous = Number(stock?.cantidad ?? 0);
      const next = previous + Number(line.cantidad);
      if (stock)
        await tx.stockAlmacen.update({ where: { id: stock.id }, data: { cantidad: next } });
      else
        await tx.stockAlmacen.create({
          data: {
            productoId: line.productoId,
            almacenId: line.almacenId,
            loteId: line.loteId,
            estadoInventarioId: line.estadoInventarioId,
            cantidad: next,
            costoPromedio: Number(line.costoUnitario),
          },
        });
      await tx.detalleMovimientoInventario.create({
        data: {
          movimientoId: reversal.id,
          productoId: line.productoId,
          almacenId: line.almacenId,
          loteId: line.loteId,
          estadoInventarioId: line.estadoInventarioId,
          direccion: 'ENTRADA',
          cantidad: line.cantidad,
          costoUnitario: line.costoUnitario,
          costoTotal: line.costoTotal,
          saldoAnterior: previous,
          saldoPosterior: next,
        },
      });
    }
  }

  private async createSaleReturnTx(tx: Transaction, dto: CreateReturnDto, workerId: bigint) {
    const sale = await tx.venta.findUnique({
      where: { id: BigInt(dto.operacionId) },
      include: {
        cuentaCobrar: true,
        detalles: {
          include: {
            producto: true,
            detallesDevolucion: { where: { devolucionVenta: { estado: 'CONFIRMADA' } } },
          },
        },
        movimientosInventario: {
          where: { tipoOperacion: 'VENTA', estado: 'CONFIRMADO' },
          include: { detalles: true },
        },
      },
    });
    if (!sale || sale.estado !== 'CONFIRMADA')
      throw new BadRequestException('Solo se puede devolver una venta confirmada');
    if (!sale.cuentaCobrar)
      throw new BadRequestException('La venta no tiene su cuenta por cobrar principal');
    const selected = this.validateReturnItems(sale.detalles, dto.items);
    const defaultState = await this.availableState(tx);
    // Costo al que salió cada producto en esta venta, para que la devolución vuelva a entrar
    // valorizada y no a cero. Si el movimiento de la venta no tiene la línea (datos viejos),
    // usa el costo de referencia del producto.
    //
    // Si la venta fue editada, el kardex tiene la salida original, la entrada que la revirtió
    // y la salida nueva. Por eso se cuenta el NETO (salidas menos entradas): así queda solo
    // lo que realmente está vendido hoy, con su costo.
    const lineasDeMovimiento = sale.movimientosInventario.flatMap(
      (movimiento) => movimiento.detalles,
    );
    const signoDeLinea = (linea: { direccion: string }) => (linea.direccion === 'SALIDA' ? 1 : -1);
    const costoDeSalida = (productoId: bigint, fallback: number) => {
      const lineas = lineasDeMovimiento.filter((linea) => linea.productoId === productoId);
      const qty = lineas.reduce(
        (sum, linea) => sum + signoDeLinea(linea) * Number(linea.cantidad),
        0,
      );
      const costo = lineas.reduce(
        (sum, linea) => sum + signoDeLinea(linea) * Number(linea.costoTotal),
        0,
      );
      return qty > 0 ? costo / qty : fallback;
    };
    // La venta ya no guarda un lote por línea (el sistema saca FIFO y una línea puede salir
    // de varios lotes), así que la devolución vuelve a los lotes que dice el kardex, en el
    // mismo orden en que salieron. Si no hay kardex —ventas viejas— entra sin lote.
    const repartirEntreLotesVendidos = (productoId: bigint, aDevolver: number) => {
      const porLote = new Map<string, { loteId: bigint | null; cantidad: number }>();
      for (const linea of lineasDeMovimiento) {
        if (linea.productoId !== productoId) continue;
        const clave = linea.loteId?.toString() ?? 'sin-lote';
        const acumulado = porLote.get(clave) ?? { loteId: linea.loteId, cantidad: 0 };
        acumulado.cantidad += signoDeLinea(linea) * Number(linea.cantidad);
        porLote.set(clave, acumulado);
      }
      const disponibles = [...porLote.values()].filter((fila) => fila.cantidad > 0);

      const reparto: { loteId: bigint | null; cantidad: number }[] = [];
      let restante = aDevolver;
      for (const fila of disponibles) {
        if (restante <= 0) break;
        const cantidad = Math.min(fila.cantidad, restante);
        reparto.push({ loteId: fila.loteId, cantidad });
        restante -= cantidad;
      }
      // Sobrante (p. ej. una segunda devolución parcial): va al último lote conocido.
      if (restante > 0)
        reparto.push({ loteId: disponibles.at(-1)?.loteId ?? null, cantidad: restante });
      return reparto;
    };

    const total = selected.reduce(
      (sum, entry) =>
        sum +
        this.returnLineAmount(
          entry.detail,
          entry.quantity,
          Number(sale.subtotal),
          Number(sale.total),
        ),
      0,
    );
    // La bandera sale de la unidad DE LA VENTA, no de la activa: la devolución tiene que
    // comportarse igual que la venta que corrige. En un puesto sin inventario la parte de dinero
    // (la nota de crédito, el ajuste de la cuenta por cobrar, el saldo a favor) funciona igual;
    // lo único que no ocurre es el reingreso físico, y así queda guardado.
    const controlaInventario = await unidadControlaInventario(tx, sale.unidadNegocioId);
    const reintegra = (entry: { input: { reintegraInventario?: boolean } }) =>
      controlaInventario && entry.input.reintegraInventario !== false;

    const code = `DV-${Date.now().toString(36).toUpperCase()}`;
    const created = await tx.devolucionVenta.create({
      data: {
        ventaId: sale.id,
        trabajadorId: workerId,
        codigo: code,
        motivo: dto.motivo.trim(),
        observaciones: dto.observaciones?.trim(),
        total,
        estado: 'CONFIRMADA',
        detalles: {
          create: selected.map((entry) => ({
            detalleVentaId: entry.detail.id,
            productoId: entry.detail.productoId,
            loteId: entry.detail.loteId,
            cantidad: entry.quantity,
            precioUnitario: entry.detail.precioUnitario,
            subtotal: this.returnLineAmount(
              entry.detail,
              entry.quantity,
              Number(sale.subtotal),
              Number(sale.total),
            ),
            estadoDestinoId: entry.input.estadoDestinoId
              ? BigInt(entry.input.estadoDestinoId)
              : defaultState.id,
            reintegraInventario: reintegra(entry),
          })),
        },
      },
    });
    const physical = selected.filter(reintegra);
    if (physical.length) {
      for (const entry of physical) {
        const state = await tx.estadoInventario.findUnique({
          where: { id: BigInt(entry.input.estadoDestinoId ?? 0) },
        });
        if (!state?.estado)
          throw new BadRequestException(
            'Seleccione un estado de inventario válido para cada producto devuelto',
          );
      }
      const movement = await tx.movimientoInventario.create({
        data: {
          tipoMovimiento: 'ENTRADA',
          tipoOperacion: 'DEVOLUCION_VENTA',
          almacenDestinoId: sale.almacenOrigenId,
          devolucionVentaId: created.id,
          trabajadorId: workerId,
          estado: 'CONFIRMADO',
          numeroReferencia: code,
          observaciones: `Ingreso por devolución de venta ${saleCode(sale.id)}`,
        },
      });
      for (const entry of physical) {
        const stateId = entry.input.estadoDestinoId
          ? BigInt(entry.input.estadoDestinoId)
          : defaultState.id;
        const unitCost = costoDeSalida(
          entry.detail.productoId,
          Number(entry.detail.producto.costoReferencia),
        );
        for (const parte of repartirEntreLotesVendidos(entry.detail.productoId, entry.quantity)) {
          const stock = await this.stockRow(
            tx,
            entry.detail.productoId,
            sale.almacenOrigenId,
            parte.loteId,
            stateId,
          );
          const previous = Number(stock?.cantidad ?? 0);
          const next = previous + parte.cantidad;
          if (stock)
            await tx.stockAlmacen.update({
              where: { id: stock.id },
              data: {
                cantidad: next,
                costoPromedio: weightedAverage(
                  previous,
                  Number(stock.costoPromedio),
                  parte.cantidad,
                  unitCost,
                ),
              },
            });
          else
            await tx.stockAlmacen.create({
              data: {
                productoId: entry.detail.productoId,
                almacenId: sale.almacenOrigenId,
                loteId: parte.loteId,
                estadoInventarioId: stateId,
                cantidad: next,
                costoPromedio: unitCost,
              },
            });
          await tx.detalleMovimientoInventario.create({
            data: {
              movimientoId: movement.id,
              productoId: entry.detail.productoId,
              almacenId: sale.almacenOrigenId,
              loteId: parte.loteId,
              estadoInventarioId: stateId,
              direccion: 'ENTRADA',
              cantidad: parte.cantidad,
              costoUnitario: unitCost,
              costoTotal: parte.cantidad * unitCost,
              saldoAnterior: previous,
              saldoPosterior: next,
            },
          });
        }
      }
    }
    const previousBalance = Number(sale.cuentaCobrar.saldoPendiente);
    const newBalance = Math.max(previousBalance - total, 0);
    const credit = Math.max(total - previousBalance, 0);
    const paymentState =
      newBalance <= 0
        ? 'PAGADA'
        : Number(sale.cuentaCobrar.montoPagado) > 0
          ? 'PARCIAL'
          : 'PENDIENTE';
    await tx.cuentaCobrar.update({
      where: { id: sale.cuentaCobrar.id },
      data: { saldoPendiente: newBalance, estado: paymentState },
    });
    if (credit > 0)
      await tx.saldoFavorCliente.create({
        data: {
          clienteId: sale.clienteId,
          devolucionVentaId: created.id,
          montoOriginal: credit,
          montoDisponible: credit,
        },
      });
    const fullyReturned = this.isFullyReturned(sale.detalles, selected);
    await tx.venta.update({
      where: { id: sale.id },
      data: {
        estadoPago: paymentState,
        estadoDevolucion: fullyReturned ? 'DEVOLUCION_TOTAL' : 'DEVOLUCION_PARCIAL',
      },
    });
    return created.id;
  }

  private validateReturnItems(details: any[], items: CreateReturnDto['items']) {
    const seen = new Set<number>();
    return items.map((input) => {
      if (seen.has(input.detalleId))
        throw new BadRequestException('No repita un producto en la devolución');
      seen.add(input.detalleId);
      const detail = details.find((item) => item.id === BigInt(input.detalleId));
      if (!detail)
        throw new BadRequestException('Un producto no pertenece a la operación original');
      const returned = detail.detallesDevolucion.reduce(
        (sum: number, item: any) => sum + Number(item.cantidad),
        0,
      );
      if (input.cantidad > Number(detail.cantidad) - returned)
        throw new BadRequestException(
          `La cantidad devuelta supera lo disponible para ${detail.producto.nombre}`,
        );
      return { detail, input, quantity: input.cantidad };
    });
  }

  private returnLineAmount(detail: any, quantity: number, subtotal: number, total: number) {
    const taxFactor = subtotal > 0 ? total / subtotal : 1;
    return (
      Math.round((Number(detail.subtotal) / Number(detail.cantidad)) * quantity * taxFactor * 100) /
      100
    );
  }

  private isFullyReturned(details: any[], selected: { detail: any; quantity: number }[]) {
    return details.every((detail) => {
      const previous = detail.detallesDevolucion.reduce(
        (sum: number, item: any) => sum + Number(item.cantidad),
        0,
      );
      const current = selected.find((item) => item.detail.id === detail.id)?.quantity ?? 0;
      return previous + current >= Number(detail.cantidad);
    });
  }

  /**
   * Registra el cobro inicial de una venta, que puede venir repartido en varios métodos
   * (p. ej. una parte en efectivo y otra en Yape): crea un PagoCliente por método y deja
   * la cuenta por cobrar con lo abonado, su saldo y su estado al día.
   */
  private async applyInitialPayments(
    tx: Transaction,
    account: { id: bigint; montoOriginal: number },
    workerId: bigint,
    payments: { methodId: bigint; monto: number }[],
  ) {
    if (payments.length === 0) return;
    const abonado = Math.round(payments.reduce((sum, p) => sum + p.monto, 0) * 100) / 100;
    await tx.pagoCliente.createMany({
      data: payments.map((payment) => ({
        cuentaCobrarId: account.id,
        metodoPagoId: payment.methodId,
        trabajadorId: workerId,
        monto: payment.monto,
        observaciones: 'Pago inicial de la venta',
      })),
    });
    const saldo = Math.max(Math.round((account.montoOriginal - abonado) * 100) / 100, 0);
    await tx.cuentaCobrar.update({
      where: { id: account.id },
      data: {
        montoPagado: abonado,
        saldoPendiente: saldo,
        estado: saldo <= 0 ? 'PAGADA' : 'PARCIAL',
      },
    });
  }

  private async paymentTerms(
    tx: Transaction,
    dto: {
      tipoPago: string;
      pagosIniciales?: { metodoPagoId: number; monto: number }[];
      fechaVencimiento?: string;
    },
    total: number,
    trabajadorId: bigint,
  ) {
    if (total <= 0) throw new BadRequestException('El total de la operación debe ser mayor a cero');
    const lines = dto.pagosIniciales ?? [];
    const abonado =
      Math.round(lines.reduce((sum, line) => sum + Number(line.monto), 0) * 100) / 100;
    const isCash = dto.tipoPago === 'CONTADO';

    if (isCash && Math.abs(abonado - total) > 0.005)
      throw new BadRequestException('Los métodos de pago deben sumar el total de la venta');
    if (dto.tipoPago === 'MIXTO' && (abonado <= 0 || abonado >= total))
      throw new BadRequestException('El abono inicial debe ser mayor a cero y menor que el total');
    if (dto.tipoPago === 'CREDITO' && abonado > 0)
      throw new BadRequestException('Una venta a crédito no registra un pago inicial');
    if (!isCash && !dto.fechaVencimiento)
      throw new BadRequestException('Ingrese la fecha de vencimiento del saldo');

    let dueDate: Date | null = null;
    if (dto.fechaVencimiento) {
      const dueKey = dto.fechaVencimiento.slice(0, 10);
      if (dueKey < limaTodayKey())
        throw new BadRequestException('La fecha de vencimiento no puede estar en el pasado');
      dueDate = new Date(`${dueKey}T00:00:00.000Z`);
    }

    // Los métodos elegidos se validan en una sola consulta.
    const payments: { methodId: bigint; monto: number }[] = [];
    if (dto.tipoPago !== 'CREDITO' && lines.length > 0) {
      const ids = [...new Set(lines.map((line) => BigInt(line.metodoPagoId)))];
      const methods = await tx.metodoPago.findMany({
        where: { id: { in: ids } },
        include: { categoria: true },
      });
      for (const line of lines) {
        const monto = Math.round(Number(line.monto) * 100) / 100;
        if (monto <= 0)
          throw new BadRequestException('Cada método de pago debe tener un monto mayor a cero');
        const method = methods.find((row) => row.id === BigInt(line.metodoPagoId));
        if (!method?.estado || method.categoria?.estado === false)
          throw new BadRequestException('Uno de los métodos de pago no está disponible');
        // Un método con dueño (el Yape de un repartidor) solo lo puede usar ese trabajador;
        // los que tienen `trabajadorId` en null (Efectivo) son de todos.
        if (method.trabajadorId !== null && method.trabajadorId !== trabajadorId)
          throw new BadRequestException(
            `El método ${etiquetaMetodoPago(method)} pertenece a otro trabajador`,
          );
        payments.push({ methodId: method.id, monto });
      }
    }

    return { payments, initial: abonado, dueDate };
  }

  private async availableState(tx: Transaction) {
    const state = await tx.estadoInventario.findUnique({ where: { codigo: 'DISPONIBLE' } });
    if (!state) throw new BadRequestException('No existe el estado de inventario DISPONIBLE');
    return state;
  }

  /**
   * Devuelve UNA cuenta por cobrar ya actualizada, para responder después de un cobro o de
   * reprogramar un vencimiento. Antes se traían todas las cuentas con todos sus pagos solo
   * para quedarse con una.
   */
  private async cuentaCobrarActualizada(tx: Transaction, cuentaId: bigint) {
    const row = await tx.cuentaCobrar.findUnique({
      where: { id: cuentaId },
      include: {
        cliente: true,
        venta: true,
        pagos: {
          orderBy: { fechaPago: 'desc' },
          include: { metodoPago: true, trabajador: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Cuenta por cobrar no encontrada');
    return this.receivableView(row);
  }

  private paymentView(row: any) {
    return {
      id: row.id.toString(),
      fecha: row.fechaPago,
      monto: Number(row.monto),
      metodo: row.metodoPago.nombre,
      observaciones: row.observaciones,
      estado: row.estado,
      trabajador: `${row.trabajador.nombres} ${row.trabajador.apellidos}`.trim(),
    };
  }

  private accountState(row: any) {
    return deriveAccountState(row);
  }

  private receivableView(row: any) {
    return {
      id: row.id.toString(),
      tipo: 'cobrar',
      tercero: row.cliente.nombreLegal,
      documento: row.cliente.numeroDocumento,
      comprobante: saleCode(row.venta.id),
      emision: row.fechaEmision,
      vencimiento: row.fechaVencimiento,
      original: Number(row.montoOriginal),
      pagado: Number(row.montoPagado),
      saldo: Number(row.saldoPendiente),
      estado: this.accountState(row),
      pagos: row.pagos.map((payment: any) => this.paymentView(payment)),
    };
  }

  private stockRow(
    tx: Transaction,
    productoId: bigint,
    almacenId: bigint,
    loteId: bigint | null,
    estadoInventarioId: bigint,
  ) {
    return tx.stockAlmacen.findFirst({
      where: { productoId, almacenId, loteId, estadoInventarioId },
    });
  }

  /**
   * Filas de stock de las que puede salir una venta, en orden FIFO: primero lo más antiguo.
   *
   * La venta nunca elige lote, así que acá se devuelven TODOS los lotes del producto en ese
   * almacén y `applySaleOutbound` va tomando de uno en uno hasta cubrir la cantidad: si el
   * lote más viejo tiene 1 unidad y se venden 5, salen 1 de ese lote y 4 del siguiente.
   */
  private saleableStockRows(
    tx: Transaction,
    productoId: bigint,
    almacenId: bigint,
    loteId: bigint | null,
  ) {
    return tx.stockAlmacen.findMany({
      where: {
        productoId,
        almacenId,
        loteId: loteId ?? undefined,
        cantidad: { gt: 0 },
        estadoInventario: { estado: true, permiteVenta: true },
      },
      // `fechaProduccion` es la fecha en que el lote entró al almacén. El id desempata los
      // lotes sin fecha y el stock que no controla lote.
      orderBy: [{ lote: { fechaProduccion: 'asc' } }, { id: 'asc' }],
    });
  }

  /**
   * Una venta fuera del alcance no da 403 sino 404: para quien no puede verla, no existe.
   * Por eso el filtro de unidad entra en el mismo `where` y no en un chequeo posterior.
   */
  private findSale(tx: Transaction, id: bigint, alcance?: AlcanceUnidad) {
    return tx.venta
      .findFirst({
        where: { id, ...(alcance ? filtroUnidad(alcance) : {}) },
        include: {
          cliente: true,
          almacenOrigen: true,
          trabajador: true,
          detalles: {
            include: {
              producto: true,
              detallesDevolucion: { where: { devolucionVenta: { estado: 'CONFIRMADA' } } },
            },
          },
          cuentaCobrar: {
            include: {
              pagos: {
                include: { metodoPago: { include: { categoria: true } } },
                orderBy: { id: 'asc' },
              },
            },
          },
          devoluciones: true,
          movimientosInventario: { orderBy: { id: 'asc' } },
        },
      })
      .then((row) => row ?? Promise.reject(new NotFoundException('Venta no encontrada')));
  }

  /**
   * Importe de una línea, redondeado al centavo. La cantidad en ventas es un entero
   * positivo, pero el precio puede tener centavos: sin redondear acá, el total de
   * la venta cerraba un centavo distinto al que el usuario vio en el formulario.
   */
  private lineTotal(item: { cantidad: number; precioUnitario: number; descuento?: number }) {
    const importe = Math.max(item.cantidad * item.precioUnitario - (item.descuento ?? 0), 0);
    return Math.round(importe * 100) / 100;
  }

  /**
   * Filtro opcional por `fecha` para los listados. `from`/`to` son días de calendario
   * `YYYY-MM-DD` en America/Lima y `to` es inclusivo. Devuelve `undefined` si no llega ninguno.
   */
  private listDateRange(from?: string, to?: string): { gte?: Date; lt?: Date } | undefined {
    if (!from && !to) return undefined;
    const gte = from ? new Date(`${from}T00:00:00-05:00`) : undefined;
    let lt: Date | undefined;
    if (to) {
      lt = new Date(`${to}T00:00:00-05:00`);
      lt.setDate(lt.getDate() + 1);
    }
    if ((gte && Number.isNaN(gte.getTime())) || (lt && Number.isNaN(lt.getTime()))) {
      throw new BadRequestException('El rango de fechas no es valido');
    }
    return { gte, lt };
  }

  private totals(
    items: { cantidad: number; precioUnitario: number; descuento?: number }[],
    discount = 0,
    includeIgv = true,
  ) {
    const subtotal = items.reduce((sum, item) => sum + this.lineTotal(item), 0);
    const descuento = discount ?? 0;
    const taxable = Math.max(subtotal - descuento, 0);
    const igv = includeIgv ? taxable * 0.18 : 0;
    return { subtotal, descuento, igv, total: taxable + igv };
  }

  private saleView(row: any) {
    const returned =
      row.devoluciones
        ?.filter((item: any) => item.estado === 'CONFIRMADA')
        .reduce((sum: number, item: any) => sum + Number(item.total), 0) ?? 0;
    const salidas = (row.movimientosInventario ?? []).filter(
      (movimiento: any) => movimiento.tipoMovimiento === 'SALIDA',
    );
    const movimientoVigente = salidas[salidas.length - 1] ?? row.movimientosInventario?.[0];
    return {
      id: row.id.toString(),
      codigo: saleCode(row.id),
      fecha: row.fecha,
      clienteId: row.clienteId.toString(),
      cliente: row.cliente.nombreLegal,
      clienteDocumento: row.cliente.numeroDocumento,
      clienteTipoDocumento: row.cliente.tipoDocumento,
      almacenId: row.almacenOrigenId.toString(),
      almacen: row.almacenOrigen.nombre,
      trabajadorId: row.trabajadorId.toString(),
      registradoPor: row.trabajador
        ? `${row.trabajador.nombres} ${row.trabajador.apellidos}`
        : null,
      pago: row.tipoPago,
      observaciones: row.observaciones,
      subtotal: Number(row.subtotal),
      igv: Number(row.igv),
      descuento: Number(row.descuento),
      total: Number(row.total),
      montoInicial: Number(row.montoInicial),
      // Desglose del cobro inicial por método (para reconstruirlo al editar la venta).
      pagosIniciales:
        row.cuentaCobrar?.pagos?.map((pago: any) => ({
          metodoPagoId: pago.metodoPagoId.toString(),
          metodo: pago.metodoPago ? etiquetaMetodoPago(pago.metodoPago) : '',
          monto: Number(pago.monto),
        })) ?? [],
      fechaVencimiento: row.cuentaCobrar?.fechaVencimiento ?? row.fechaVencimientoPago,
      cuentaCobrarId: row.cuentaCobrar?.id?.toString() ?? null,
      totalNeto: Math.max(Number(row.total) - returned, 0),
      pagado: Number(row.cuentaCobrar?.montoPagado ?? 0),
      saldo: Number(row.cuentaCobrar?.saldoPendiente ?? 0),
      estado: row.estado,
      estadoPago: row.estadoPago,
      estadoDevolucion: row.estadoDevolucion,
      // Si la venta se editó hay varios movimientos; el que vale es la última SALIDA (la
      // primera ya fue revertida), así el enlace "Ver kardex" no lleva a un movimiento anulado.
      kardexId: movimientoVigente?.id?.toString() ?? null,
      kardexRef: movimientoVigente?.numeroReferencia ?? null,
      items: row.detalles.map((item: any) => ({
        id: item.id.toString(),
        productoId: item.productoId.toString(),
        producto: item.producto.nombre,
        cantidad: Number(item.cantidad),
        cantidadDevuelta:
          item.detallesDevolucion?.reduce(
            (sum: number, detail: any) => sum + Number(detail.cantidad),
            0,
          ) ?? 0,
        precio: Number(item.precioUnitario),
        // Se devuelve para que el formulario de edición pueda precargarlo; si no, al editar
        // se perdía el descuento y el total de la venta subía solo.
        descuento: Number(item.descuento),
        subtotal: Number(item.subtotal),
      })),
    };
  }
}
