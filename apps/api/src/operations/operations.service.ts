import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { evaluarCredito, situacionDeCredito } from '../common/credit';
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
import {
  TRANSACCION_DE_STOCK,
  Transaction,
  movementLabel,
  movementPhrase,
  weightedAverage,
} from '../common/stock';
import { resolverTrabajadorAutor } from '../common/worker-context';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnnulSaleDto,
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

const saleCode = (id: bigint | number | string) => `V-${id.toString().padStart(6, '0')}`;

/**
 * Cómo se comporta `createSaleReturnTx`. Una devolución comercial no lleva nada de esto; una
 * anulación sí, porque además de devolver la mercadería tiene que sacar la plata de la caja.
 */
type OpcionesDevolucion = {
  tipo?: 'COMERCIAL' | 'ANULACION';
  /** Con qué método salió la plata. Sin esto, el reembolso espeja los cobros originales. */
  reembolso?: { metodoPagoId?: bigint };
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
        // Sin el cliente de sistema "Ventas del día": sus ventas las genera la carga diaria.
        where: { estado: true, sistema: false, ...deUnidad },
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

    // Antes esto era un `groupBy` de saldos. Ahora sale de `situacionDeCredito`, que es la
    // misma función que usa la validación al guardar: así el aviso del formulario y el corte
    // del servidor no pueden discrepar.
    const credito = await situacionDeCredito(this.prisma, { alcance });

    return {
      clientes: clientes.map((item) => {
        const situacion = credito.get(item.id.toString());
        return {
          id: item.id.toString(),
          nombre: item.nombreLegal,
          documento: item.numeroDocumento,
          deudaActual: situacion?.deuda ?? 0,
          comprobantesPendientes: situacion?.comprobantes ?? 0,
          // Con estos cuatro el formulario puede avisar al instante si le alcanza el crédito,
          // sin una ida y vuelta más al servidor al elegir el cliente.
          limiteCredito: situacion?.limite ?? null,
          creditoDisponible: situacion?.disponible ?? null,
          vencidas: situacion?.vencidas ?? 0,
          vencido: situacion?.vencido ?? 0,
          // Envases nuestros que el cliente todavía tiene. El formulario lo usa para avisar
          // antes de guardar que no puede devolver más de los que debe.
          saldoEnvases: item.saldoEnvases,
        };
      }),
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
        // El formulario lo necesita para saber cuántos envases entrega la venta y, con eso,
        // precargar los vacíos que el cliente devuelve. Sin esto tendría que adivinar.
        esRetornable: item.esRetornable,
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

  /**
   * Última venta confirmada de un cliente, en la forma mínima que necesita la venta rápida
   * para ofrecer "repetir el pedido de siempre". Devuelve `null` si el cliente nunca compró.
   *
   * No reutiliza `sales()` a propósito: eso traería hasta mil ventas con su kardex para
   * quedarse con una, y esta pantalla la consulta cada vez que se elige un cliente.
   */
  async lastSale(clienteId: string, actor: AuthUser, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const venta = await this.prisma.venta.findFirst({
      where: { ...filtroUnidad(alcance), clienteId: BigInt(clienteId), estado: 'CONFIRMADA' },
      orderBy: { fecha: 'desc' },
      select: {
        fecha: true,
        total: true,
        detalles: {
          select: {
            productoId: true,
            cantidad: true,
            precioUnitario: true,
            producto: { select: { nombre: true } },
          },
        },
      },
    });
    if (!venta) return null;
    return {
      fecha: venta.fecha.toISOString(),
      total: Number(venta.total),
      items: venta.detalles.map((detalle) => ({
        productoId: detalle.productoId.toString(),
        producto: detalle.producto.nombre,
        cantidad: Number(detalle.cantidad),
        precioUnitario: Number(detalle.precioUnitario),
      })),
    };
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
      // Sin este corte, el mensaje sería "la cuenta ya está pagada" —el saldo de una venta
      // anulada queda en cero— y nadie entendería por qué no puede cobrarla.
      if (account.estado === 'ANULADA')
        throw new BadRequestException('Esta venta está anulada: no se le puede cobrar.');
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
          // Cobranza de calle: es la plata que el trabajador tiene que rendir, y la única
          // que el reporte de caja por trabajador suma como cobrado.
          origen: 'COBRANZA',
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
      // Si esta devolución nació de anular la venta y no de un reclamo del cliente. El campo
      // `tipo` de arriba es otra cosa (qué operación se está devolviendo, siempre 'VENTA').
      esAnulacion: row.tipo === 'ANULACION',
      // Plata que salió de la caja al anular. Va en positivo para mostrarla; en la base los
      // reembolsos son montos negativos.
      reembolsado: Math.abs(
        row.reembolsos?.reduce((sum: number, pago: any) => sum + Number(pago.monto), 0) ?? 0,
      ),
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
            ? `Ingresaron ${units} unidades al inventario por ${movementPhrase(row.tipoOperacion)}.`
            : row.tipoMovimiento === 'SALIDA'
              ? `Salieron ${units} unidades del inventario por ${movementPhrase(
                  row.tipoOperacion,
                )}.`
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
      const saleId = await this.registrarVenta(tx, dto, actor, unidadActiva);
      return this.saleView(await this.findSale(tx, saleId));
    }, TRANSACCION_DE_STOCK);
  }

  /**
   * El cuerpo de `createSale`, dentro de una transacción ajena. Lo usa también la carga diaria,
   * que registra varias cosas de un mismo día en una sola transacción.
   *
   * `fecha` (YYYY-MM-DD) fecha la venta en un día pasado: la venta, su kardex y su cobro
   * inicial quedan a mediodía de Lima de ese día, igual que cuando se corrige la fecha al editar.
   * Sin ella todo queda con la hora actual, como siempre.
   */
  async registrarVenta(
    tx: Transaction,
    dto: CreateOperationalSaleDto,
    actor: AuthUser,
    unidadActiva?: string,
    opciones: { fecha?: string } = {},
  ): Promise<bigint> {
    let fechaVenta: Date | undefined;
    if (opciones.fecha) {
      const fechaKey = opciones.fecha.slice(0, 10);
      if (fechaKey > limaTodayKey())
        throw new BadRequestException('La fecha de la venta no puede estar en el futuro');
      fechaVenta = new Date(`${fechaKey}T12:00:00-05:00`);
    }
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
    // Lo que esta venta va a dejar a deber. Se evalúa contra la deuda vigente del cliente
    // antes de escribir nada: si no alcanza, la venta ni siquiera nace.
    const autorizacion = await this.exigirCreditoDisponible(tx, {
      clienteId: BigInt(dto.clienteId),
      saldoQueDeja: Math.max(Math.round((totals.total - terms.initial) * 100) / 100, 0),
      actor,
    });
    const sale = await tx.venta.create({
      data: {
        unidadNegocioId,
        clienteId: BigInt(dto.clienteId),
        creditoAutorizadoPorId: autorizacion?.autorizadoPorId ?? null,
        creditoAutorizadoNota: autorizacion?.nota ?? null,
        ...(fechaVenta ? { fecha: fechaVenta } : {}),
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
        vaciosRecibidos: dto.vaciosDevueltos ?? 0,
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
    if (controlaInventario) await this.applySaleOutbound(tx, sale.id, '', fechaVenta);
    // Los envases van fuera del gateo: el saldo de envases es una deuda del cliente, no
    // stock del almacén, y un puesto sin inventario igual entrega bidones.
    await this.aplicarEnvasesDeVenta(
      tx,
      sale.id,
      sale.clienteId,
      dto.vaciosDevueltos ?? 0,
      actor.userId,
    );
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
      fechaVenta,
    );
    const paymentState =
      terms.initial >= Number(sale.total) - 0.005
        ? 'PAGADA'
        : terms.initial > 0
          ? 'PARCIAL'
          : 'PENDIENTE';
    await tx.venta.update({ where: { id: sale.id }, data: { estadoPago: paymentState } });
    return sale.id;
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
      // Una venta anulada ya fue deshecha entera y su plata devuelta: editarla rearmaría la
      // cuenta por cobrar desde cero y le volvería a cobrar al cliente. El mensaje va antes
      // que el de devoluciones porque es más preciso: toda anulación ES una devolución.
      if (sale.cuentaCobrar?.estado === 'ANULADA')
        throw new BadRequestException('Esta venta está anulada: no se puede editar.');
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
      // Acotado a `origen: 'VENTA'`: los cobros de Cobranzas ya cortaron la edición arriba, y
      // un reembolso de anulación nunca debe borrarse (también cortado arriba), pero el
      // filtro deja explícito qué es lo único que esta línea puede tocar.
      if (sale.cuentaCobrar)
        await tx.pagoCliente.deleteMany({
          where: { cuentaCobrarId: sale.cuentaCobrar.id, origen: 'VENTA' },
        });

      // El gateo va acá afuera y NO adentro de `reverseSaleOutbound`: ese método tiene que
      // seguir fallando cuando una venta con inventario no tiene movimiento, porque es lo que
      // impide que al editar una venta vieja se descuente stock que nunca se descontó.
      if (controlaInventario) await this.reverseSaleOutbound(tx, saleId);
      // Los envases se deshacen contra el cliente ORIGINAL: el DTO permite cambiar de cliente,
      // y los bidones se los llevó el que figuraba antes.
      await this.revertirEnvasesDeVenta(
        tx,
        saleId,
        sale.clienteId,
        actor.userId,
        'la edición de la venta',
      );

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
      // `excluirVentaId` es imprescindible acá: sin él, la propia deuda de esta venta contaría
      // como deuda previa y una venta a crédito no se podría editar nunca más.
      const autorizacion = await this.exigirCreditoDisponible(tx, {
        clienteId: BigInt(dto.clienteId),
        saldoQueDeja: Math.max(Math.round((totals.total - terms.initial) * 100) / 100, 0),
        actor,
        excluirVentaId: saleId,
      });
      await tx.venta.update({
        where: { id: saleId },
        data: {
          clienteId: BigInt(dto.clienteId),
          // Se reescriben siempre, también a null: si la venta pasó a contado o el cliente
          // regularizó, la marca de excepción tiene que desaparecer, no quedar pegada.
          creditoAutorizadoPorId: autorizacion?.autorizadoPorId ?? null,
          creditoAutorizadoNota: autorizacion?.nota ?? null,
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
          vaciosRecibidos: dto.vaciosDevueltos ?? 0,
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
      await this.aplicarEnvasesDeVenta(
        tx,
        saleId,
        BigInt(dto.clienteId),
        dto.vaciosDevueltos ?? 0,
        actor.userId,
      );

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

  /**
   * Anula una venta.
   *
   * No existe un estado `ANULADA` en `Venta`: anular ES generar la devolución total de todo
   * lo que quede por devolver, marcada con `tipo: 'ANULACION'`. Se hizo así a propósito —
   * deshacer algo en este sistema es escribir el hecho contrario, nunca reescribir el
   * registro original— y además evita partir los reportes en dos caminos: ya netean las
   * devoluciones, así que una venta anulada queda en cero sin tocar una sola consulta.
   *
   * Se permite haya cobros o no. Si el cliente había pagado algo, esa plata NO le queda como
   * saldo a favor: se asume que se le devolvió en efectivo en el momento, y la salida queda
   * registrada como un reembolso con su fecha y su responsable.
   *
   * No se puede deshacer ni repetir.
   */
  async annulSale(id: string, dto: AnnulSaleDto, actor: AuthUser, unidadActiva?: string) {
    const devolucionId = await this.prisma.$transaction(async (tx) => {
      const saleId = BigInt(id);
      const workerId = await resolverTrabajadorAutor(tx, actor, dto.trabajadorId);
      const alcance = await resolverAlcanceUnidad(tx, actor, unidadActiva);
      const sale = await tx.venta.findFirst({
        where: { id: saleId, ...filtroUnidad(alcance) },
        include: {
          cuentaCobrar: true,
          devoluciones: true,
          detalles: {
            include: {
              detallesDevolucion: { where: { devolucionVenta: { estado: 'CONFIRMADA' } } },
            },
          },
        },
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (
        sale.devoluciones.some(
          (item) => item.tipo === 'ANULACION' && item.estado === 'CONFIRMADA',
        ) ||
        sale.cuentaCobrar?.estado === 'ANULADA'
      )
        throw new BadRequestException('Esta venta ya está anulada.');
      if (sale.estadoDevolucion === 'DEVOLUCION_TOTAL')
        throw new BadRequestException(
          'Esta venta ya fue devuelta en su totalidad; no queda nada por anular.',
        );

      // Se devuelve lo que todavía no se devolvió: una venta con una devolución parcial
      // previa se anula por el resto, no por el total original.
      const items = sale.detalles
        .map((detalle) => {
          const yaDevuelto = detalle.detallesDevolucion.reduce(
            (sum, item) => sum + Number(item.cantidad),
            0,
          );
          return { detalleId: Number(detalle.id), cantidad: Number(detalle.cantidad) - yaDevuelto };
        })
        .filter((item) => item.cantidad > 0);
      if (!items.length)
        throw new BadRequestException(
          'Esta venta ya fue devuelta en su totalidad; no queda nada por anular.',
        );

      const created = await this.createSaleReturnTx(
        tx,
        {
          operacionId: Number(saleId),
          motivo: dto.motivo,
          observaciones: dto.observaciones,
          trabajadorId: dto.trabajadorId,
          items,
        },
        workerId,
        {
          tipo: 'ANULACION',
          reembolso: { metodoPagoId: dto.metodoPagoId ? BigInt(dto.metodoPagoId) : undefined },
        },
      );
      // Los bidones vuelven a ser nuestros: el cliente deja de deberlos.
      await this.revertirEnvasesDeVenta(
        tx,
        saleId,
        sale.clienteId,
        actor.userId,
        'la anulación de la venta',
      );
      return created;
    }, TRANSACCION_DE_STOCK);

    const row = await this.prisma.devolucionVenta.findUniqueOrThrow({
      where: { id: devolucionId },
      include: {
        venta: { include: { cliente: true } },
        detalles: { include: { producto: true, estadoDestino: true } },
        movimientosInventario: { orderBy: { id: 'asc' } },
        saldosFavor: true,
        reembolsos: { include: { metodoPago: { include: { categoria: true } } } },
      },
    });
    return this.devolucionView(row);
  }

  /** Descuenta stock según las líneas actuales de la venta y registra el movimiento de salida. */
  private async applySaleOutbound(tx: Transaction, id: bigint, referenceSuffix = '', fecha?: Date) {
    const sale = await this.findSale(tx, id);
    const movement = await tx.movimientoInventario.create({
      data: {
        ...(fecha ? { fecha } : {}),
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

  /**
   * Corta la venta si al cliente no le alcanza el crédito.
   *
   * Con `creditos.excepcion` no corta: deja pasar y devuelve a quién anotar como autorizante,
   * junto con el motivo exacto, para que la venta guarde por qué se pasó y quién lo decidió.
   * Un permiso de excepción que no deja rastro es un cheque en blanco.
   *
   * Devuelve `null` cuando la venta no deja saldo (una venta al contado no toca esto) o
   * cuando el crédito alcanza sin excepción.
   */
  private async exigirCreditoDisponible(
    tx: Transaction,
    args: { clienteId: bigint; saldoQueDeja: number; actor: AuthUser; excluirVentaId?: bigint },
  ): Promise<{ autorizadoPorId: bigint | null; nota: string } | null> {
    if (args.saldoQueDeja <= 0.005) return null;
    const situaciones = await situacionDeCredito(tx, {
      clienteIds: [args.clienteId],
      excluirVentaId: args.excluirVentaId,
    });
    const veredicto = evaluarCredito(situaciones.get(args.clienteId.toString()), args.saldoQueDeja);
    if (veredicto.ok) return null;

    const puedeSaltarlo =
      args.actor.accesoTotal || args.actor.permisos.includes('creditos.excepcion');
    if (!puedeSaltarlo) throw new BadRequestException(veredicto.mensaje);

    const autorizante = await tx.trabajador.findFirst({
      where: { userId: args.actor.userId },
      select: { id: true },
    });
    return { autorizadoPorId: autorizante?.id ?? null, nota: veredicto.mensaje };
  }

  /**
   * Cuántos envases retornables entrega esta venta, según sus líneas actuales.
   *
   * Se cuenta la cantidad vendida de los productos con `esRetornable`, no las líneas: vender
   * un pack de 3 bidones retornables entrega 3 envases, no 1.
   */
  private async envasesEntregadosPorVenta(tx: Transaction, ventaId: bigint) {
    const detalles = await tx.detalleVenta.findMany({
      where: { ventaId, producto: { esRetornable: true } },
      select: { cantidad: true },
    });
    return detalles.reduce((total, detalle) => total + Number(detalle.cantidad), 0);
  }

  /**
   * Aplica al saldo de envases del cliente lo que hizo esta venta, y lo deja anotado en el
   * historial de la pantalla "Envases".
   *
   * Se escribe UN solo movimiento con el neto: el caso normal —el cliente se lleva 2 bidones
   * llenos y entrega 2 vacíos en el mismo acto— deja su saldo igual y una sola línea que
   * explica las dos cosas. Dos movimientos separados serían más "puros" pero llenarían el
   * historial de pares que se cancelan y harían ilegible la única pregunta que esa pantalla
   * responde: quién tiene bidones nuestros.
   *
   * Esto corre también en una unidad que no lleva inventario: el saldo de envases es una
   * deuda del cliente, no stock del almacén, y un puesto sin inventario igual entrega bidones.
   */
  private async aplicarEnvasesDeVenta(
    tx: Transaction,
    ventaId: bigint,
    clienteId: bigint,
    vaciosDevueltos: number,
    userId: string | null,
  ) {
    const entregados = await this.envasesEntregadosPorVenta(tx, ventaId);
    if (entregados === 0 && vaciosDevueltos === 0) return;
    const neto = entregados - vaciosDevueltos;
    const cliente = await tx.cliente.findUniqueOrThrow({
      where: { id: clienteId },
      select: { saldoEnvases: true },
    });
    const saldo = cliente.saldoEnvases + neto;
    // Recibir más vacíos de los que el cliente debe casi siempre es un error de tipeo. Si de
    // verdad devolvió envases de más, la vía es el ajuste de la pantalla "Envases", que pide
    // su propio permiso; una venta no puede dejar al negocio debiéndole bidones al cliente.
    if (saldo < 0)
      throw new BadRequestException(
        `El cliente solo tiene ${cliente.saldoEnvases + entregados} envases nuestros, así que no puede devolver ${vaciosDevueltos}.`,
      );
    await tx.cliente.update({ where: { id: clienteId }, data: { saldoEnvases: saldo } });
    await tx.containerMovement.create({
      data: {
        clienteId,
        ventaId,
        userId,
        // `type` dice la dirección y `quantity` va siempre sin signo. Un neto de cero es un
        // ADJUSTMENT de 0: no mueve el saldo, pero deja constancia de que en esa venta se
        // entregaron y se recibieron envases.
        type: neto > 0 ? 'OUT_FULL' : neto < 0 ? 'IN_EMPTY' : 'ADJUSTMENT',
        quantity: Math.abs(neto),
        balanceAfter: saldo,
        notes: `Venta ${saleCode(ventaId)}: entregó ${entregados}, recibió ${vaciosDevueltos}`,
      },
    });
  }

  /**
   * Deshace en envases lo que hizo una venta, escribiendo el movimiento contrario. Nunca
   * borra: el historial de envases es de solo-append, igual que el kardex, porque es la
   * prueba de qué se le entregó a cada cliente y cuándo.
   *
   * Si revertir dejaría el saldo negativo —el cliente ya devolvió esos envases por la pantalla
   * de Envases entre medio— se recorta a cero y se anota en el movimiento, en vez de bloquear:
   * lo que se está corrigiendo es nuestro propio registro, y trabarlo dejaría una venta
   * imposible de editar o anular.
   */
  private async revertirEnvasesDeVenta(
    tx: Transaction,
    ventaId: bigint,
    clienteId: bigint,
    userId: string | null,
    motivo: string,
  ) {
    const movimientos = await tx.containerMovement.findMany({
      where: { ventaId },
      select: { type: true, quantity: true },
    });
    const netoPrevio = movimientos.reduce(
      (total, movimiento) =>
        total +
        (movimiento.type === 'OUT_FULL'
          ? movimiento.quantity
          : movimiento.type === 'IN_EMPTY'
            ? -movimiento.quantity
            : 0),
      0,
    );
    if (netoPrevio === 0) return;
    const cliente = await tx.cliente.findUniqueOrThrow({
      where: { id: clienteId },
      select: { saldoEnvases: true },
    });
    const deseado = cliente.saldoEnvases - netoPrevio;
    const saldo = Math.max(deseado, 0);
    const recortado = deseado < 0;
    const aplicado = saldo - cliente.saldoEnvases;
    await tx.cliente.update({ where: { id: clienteId }, data: { saldoEnvases: saldo } });
    await tx.containerMovement.create({
      data: {
        clienteId,
        ventaId,
        userId,
        type: aplicado > 0 ? 'OUT_FULL' : aplicado < 0 ? 'IN_EMPTY' : 'ADJUSTMENT',
        quantity: Math.abs(aplicado),
        balanceAfter: saldo,
        notes:
          `Venta ${saleCode(ventaId)}: se deshace el movimiento de envases por ${motivo}` +
          (recortado
            ? `. El saldo habría quedado en ${deseado}, así que se dejó en 0: el cliente ya había devuelto esos envases por otra vía.`
            : ''),
      },
    });
  }

  private async createSaleReturnTx(
    tx: Transaction,
    dto: CreateReturnDto,
    workerId: bigint,
    opciones: OpcionesDevolucion = {},
  ) {
    const esAnulacion = opciones.tipo === 'ANULACION';
    const sale = await tx.venta.findUnique({
      where: { id: BigInt(dto.operacionId) },
      include: {
        cuentaCobrar: { include: { pagos: true } },
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
    // Una venta anulada ya devolvió todo y ya se le reembolsó al cliente. Sin este corte, una
    // devolución posterior saldría con el error genérico de "supera lo disponible", que no
    // explica nada.
    if (sale.cuentaCobrar.estado === 'ANULADA' && !esAnulacion)
      throw new BadRequestException(
        'Esta venta está anulada: su devolución total ya quedó registrada.',
      );
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

    const code = `${esAnulacion ? 'AN' : 'DV'}-${Date.now().toString(36).toUpperCase()}`;
    const created = await tx.devolucionVenta.create({
      data: {
        ventaId: sale.id,
        trabajadorId: workerId,
        codigo: code,
        motivo: dto.motivo.trim(),
        observaciones: dto.observaciones?.trim(),
        total,
        estado: 'CONFIRMADA',
        tipo: esAnulacion ? 'ANULACION' : 'COMERCIAL',
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
        // Sin estado elegido vale el DISPONIBLE que ya se resolvió arriba, que es el que
        // termina guardándose. Es el caso de una anulación: la venta se está deshaciendo
        // entera, el producto nunca salió de verdad y no hay nada que elegir por línea.
        if (entry.input.estadoDestinoId === undefined) continue;
        const state = await tx.estadoInventario.findUnique({
          where: { id: BigInt(entry.input.estadoDestinoId) },
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
    const pagadoPrevio = Number(sale.cuentaCobrar.montoPagado);
    const fullyReturned = this.isFullyReturned(sale.detalles, selected);

    let paymentState: string;
    if (esAnulacion) {
      // La venta se deshace entera y la plata se le devuelve al cliente en efectivo, en
      // persona. Por eso NO se genera un saldo a favor: no le queda crédito, se va con su
      // dinero. Lo que sí queda es el registro de la salida, porque la caja del día tiene que
      // mostrar que salió plata (ver `registrarReembolsos`).
      paymentState = 'PAGADA';
      await tx.cuentaCobrar.update({
        where: { id: sale.cuentaCobrar.id },
        data: { montoPagado: 0, saldoPendiente: 0, estado: 'ANULADA' },
      });
      if (pagadoPrevio > 0)
        await this.registrarReembolsos(tx, {
          cuenta: sale.cuentaCobrar,
          devolucionId: created.id,
          ventaId: sale.id,
          workerId,
          metodoPagoId: opciones.reembolso?.metodoPagoId,
        });
    } else {
      const newBalance = Math.max(previousBalance - total, 0);
      const credit = Math.max(total - previousBalance, 0);
      paymentState = newBalance <= 0 ? 'PAGADA' : pagadoPrevio > 0 ? 'PARCIAL' : 'PENDIENTE';
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
    }
    await tx.venta.update({
      where: { id: sale.id },
      data: {
        estadoPago: paymentState,
        estadoDevolucion: fullyReturned ? 'DEVOLUCION_TOTAL' : 'DEVOLUCION_PARCIAL',
      },
    });
    return created.id;
  }

  /**
   * Registra la plata que SALE al anular una venta que ya había cobrado algo.
   *
   * Va como filas nuevas de `PagoCliente` con monto negativo, y no como una marca sobre los
   * cobros originales, por dos razones. La plata sale de la caja el día de la anulación, no
   * el día de la venta, y solo una fila nueva puede llevar esa fecha y ese responsable. Y
   * así la suma de los pagos sigue coincidiendo con `montoPagado` sin filtrar nada: es el
   * mismo criterio de solo-append que usa el kardex.
   *
   * Si se eligió un método, sale todo por ahí (cobraste por Yape pero devolviste efectivo:
   * lo que importa es de dónde salió la plata de verdad). Si no, espeja los cobros
   * originales, cada uno con su método.
   */
  private async registrarReembolsos(
    tx: Transaction,
    args: {
      cuenta: {
        id: bigint;
        montoPagado: Prisma.Decimal;
        pagos: { metodoPagoId: bigint; monto: Prisma.Decimal }[];
      };
      devolucionId: bigint;
      ventaId: bigint;
      workerId: bigint;
      metodoPagoId?: bigint;
    },
  ) {
    const observaciones = `Reembolso por anulación de la venta ${saleCode(args.ventaId)}`;
    const total = Number(args.cuenta.montoPagado);
    const lineas = args.metodoPagoId
      ? [{ metodoPagoId: args.metodoPagoId, monto: total }]
      : // El espejo se arma con el neto por método: si esa cuenta ya tuvo un reembolso previo
        // (no debería, pero la tabla lo permite), no se devuelve dos veces lo mismo.
        [...this.netoPorMetodo(args.cuenta.pagos)].map(([metodoPagoId, monto]) => ({
          metodoPagoId: BigInt(metodoPagoId),
          monto,
        }));
    for (const linea of lineas) {
      if (linea.monto <= 0) continue;
      await this.exigirMetodoDisponible(tx, linea.metodoPagoId, args.workerId);
      await tx.pagoCliente.create({
        data: {
          cuentaCobrarId: args.cuenta.id,
          metodoPagoId: linea.metodoPagoId,
          trabajadorId: args.workerId,
          monto: -linea.monto,
          origen: 'REEMBOLSO',
          devolucionVentaId: args.devolucionId,
          observaciones,
        },
      });
    }
  }

  /** Cuánto se cobró por cada método, ya restando lo que se haya reembolsado antes. */
  private netoPorMetodo(pagos: { metodoPagoId: bigint; monto: Prisma.Decimal }[]) {
    const neto = new Map<string, number>();
    for (const pago of pagos) {
      const clave = pago.metodoPagoId.toString();
      neto.set(clave, Math.round(((neto.get(clave) ?? 0) + Number(pago.monto)) * 100) / 100);
    }
    return neto;
  }

  /**
   * Que el método de cobro exista, esté activo y sea usable por este trabajador. Es la misma
   * regla que aplica `registerAccountPayment`; acá se reusa para el reembolso.
   */
  private async exigirMetodoDisponible(tx: Transaction, metodoPagoId: bigint, workerId: bigint) {
    const method = await tx.metodoPago.findUnique({
      where: { id: metodoPagoId },
      include: { categoria: true },
    });
    if (!method || !method.estado || method.categoria?.estado === false)
      throw new BadRequestException('El método de pago no está disponible');
    if (method.trabajadorId !== null && method.trabajadorId !== workerId)
      throw new BadRequestException(
        `El método ${etiquetaMetodoPago(method)} pertenece a otro trabajador`,
      );
    return method;
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
    fechaPago?: Date,
  ) {
    if (payments.length === 0) return;
    const abonado = Math.round(payments.reduce((sum, p) => sum + p.monto, 0) * 100) / 100;
    await tx.pagoCliente.createMany({
      data: payments.map((payment) => ({
        ...(fechaPago ? { fechaPago } : {}),
        cuentaCobrarId: account.id,
        metodoPagoId: payment.methodId,
        trabajadorId: workerId,
        monto: payment.monto,
        // Este cobro ya está contado en las ventas por método de pago. Marcarlo es lo que
        // impide que el reporte de caja por trabajador lo sume otra vez como cobranza.
        origen: 'VENTA',
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
          creditoAutorizadoPor: { select: { nombres: true, apellidos: true } },
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
    // La venta anulada sigue con `estado: 'CONFIRMADA'`: lo que la anula es su devolución.
    // Se deriva acá para que la pantalla no tenga que conocer esa regla.
    const anulacion = row.devoluciones?.find(
      (item: any) => item.tipo === 'ANULACION' && item.estado === 'CONFIRMADA',
    );
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
      // Desglose del cobro inicial por método (para reconstruirlo al editar la venta). Se
      // filtra por origen: una cobranza posterior o el reembolso de una anulación no son
      // parte del cobro de la venta, y reenviarlos al editar los duplicaría.
      pagosIniciales:
        row.cuentaCobrar?.pagos
          ?.filter((pago: any) => pago.origen === 'VENTA')
          .map((pago: any) => ({
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
      anulada: Boolean(anulacion),
      motivoAnulacion: anulacion?.motivo ?? null,
      fechaAnulacion: anulacion?.fecha ?? null,
      // Quién autorizó pasar el límite de crédito del cliente, cuando hizo falta. Se muestra
      // en el detalle: una excepción que no se puede mirar después no sirve de control.
      creditoAutorizadoPor: row.creditoAutorizadoPor
        ? `${row.creditoAutorizadoPor.nombres} ${row.creditoAutorizadoPor.apellidos}`
        : null,
      creditoAutorizadoNota: row.creditoAutorizadoNota ?? null,
      // Envases de esta venta. `entregados` se recalcula de las líneas porque el catálogo
      // manda: si un producto se marcó retornable después, la venta vieja sigue contando lo
      // que entregó de verdad. `vaciosRecibidos` es dato guardado, no se puede deducir.
      envasesEntregados:
        row.detalles?.reduce(
          (sum: number, item: any) =>
            sum + (item.producto?.esRetornable ? Number(item.cantidad) : 0),
          0,
        ) ?? 0,
      vaciosRecibidos: Number(row.vaciosRecibidos ?? 0),
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
