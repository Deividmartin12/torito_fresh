import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { accountState as deriveAccountState, limaTodayKey } from '../common/receivables';
import { nextSequentialCode } from '../common/next-code';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOperationalProductDto,
  CreateOperationalSaleDto,
  CreateOperationalWarehouseDto,
  CreateReturnDto,
  RegisterOperationalPaymentDto,
  UpdateOperationalSaleDto,
  UpdateReceivableDueDateDto,
} from './operations.dto';

type Transaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const saleCode = (id: bigint | number | string) =>
  `V-${id.toString().padStart(6, '0')}`;

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
  constructor(private readonly prisma: PrismaService) {}

  async catalogs() {
    const [clientes, almacenes, productos, trabajador, estadosInventario] =
      await Promise.all([
        this.prisma.cliente.findMany({ where: { estado: true }, orderBy: { nombreLegal: 'asc' } }),
        this.prisma.almacen.findMany({ where: { estado: true }, orderBy: { nombre: 'asc' } }),
        this.prisma.producto.findMany({ where: { estado: true }, orderBy: { nombre: 'asc' } }),
        this.prisma.trabajador.findFirst({ where: { estado: true }, orderBy: { id: 'asc' } }),
        this.prisma.estadoInventario.findMany({
          where: { estado: true },
          orderBy: { nombre: 'asc' },
        }),
      ]);

    const debtByClient = await this.prisma.cuentaCobrar.groupBy({
      by: ['clienteId'],
      where: { saldoPendiente: { gt: 0 } },
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
      preparado: Boolean(trabajador && almacenes.length && productos.length),
    };
  }

  async products() {
    const rows = await this.prisma.producto.findMany({
      orderBy: { nombre: 'asc' },
      include: { tipoProducto: true, stocks: true, _count: { select: { detallesVenta: true } } },
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
  async lots() {
    const rows = await this.prisma.lote.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { producto: true, stocks: true },
    });
    return rows.map((row) => ({
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
    }));
  }

  async productTypes() {
    const rows = await this.prisma.tipoProducto.findMany({
      where: { estado: true },
      orderBy: { nombre: 'asc' },
    });
    return rows.map((item) => ({ id: item.id.toString(), nombre: item.nombre }));
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

  async warehouses() {
    const rows = await this.prisma.almacen.findMany({
      orderBy: { nombre: 'asc' },
      include: { responsable: true, stocks: true },
    });
    return rows.map((item) => ({
      id: item.id.toString(),
      codigo: item.codigo,
      nombre: item.nombre,
      tipo: item.tipo,
      direccion: item.direccion ?? '',
      responsable: item.responsable
        ? `${item.responsable.nombres} ${item.responsable.apellidos}`
        : 'Sin responsable',
      productos: new Set(item.stocks.map((stock) => stock.productoId.toString())).size,
      unidades: item.stocks.reduce((sum, stock) => sum + Number(stock.cantidad), 0),
      activo: item.estado,
    }));
  }

  async createWarehouse(dto: CreateOperationalWarehouseDto) {
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
        codigo,
        nombre: dto.nombre.trim(),
        tipo: dto.tipo.trim().toUpperCase(),
        direccion: dto.direccion?.trim() || null,
      },
    });
    return {
      id: warehouse.id.toString(),
      codigo: warehouse.codigo,
      nombre: warehouse.nombre,
      tipo: warehouse.tipo,
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

  async sale(id: string) {
    return this.saleView(await this.findSale(this.prisma, BigInt(id)));
  }

  async sales(from?: string, to?: string) {
    const range = this.listDateRange(from, to);
    const rows = await this.prisma.venta.findMany({
      where: range ? { fecha: range } : undefined,
      orderBy: { fecha: 'desc' },
      take: 1000,
      include: {
        cliente: true,
        almacenOrigen: true,
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

  async stock(almacenId?: string) {
    const rows = await this.prisma.stockAlmacen.findMany({
      where: almacenId ? { almacenId: BigInt(almacenId) } : undefined,
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
      almacenTipo: row.almacen.tipo,
      lote: row.lote?.codigoLote ?? 'Sin lote',
      estado: row.estadoInventario.codigo,
      vendible: row.estadoInventario.estado && row.estadoInventario.permiteVenta,
      cantidad: Number(row.cantidad),
      reservada: Number(row.cantidadReservada),
      minimo: Number(row.stockMinimo),
      costo: Number(row.costoPromedio),
    }));
  }

  async paymentMethods() {
    const rows = await this.prisma.metodoPago.findMany({
      where: { estado: true },
      orderBy: { nombre: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id.toString(),
      nombre: row.nombre,
      requiereOperacion: row.requiereOperacion,
    }));
  }

  async accounts(clienteId?: string) {
    const rows = await this.prisma.cuentaCobrar.findMany({
      where: clienteId ? { clienteId: BigInt(clienteId) } : undefined,
      orderBy: { fechaEmision: 'desc' },
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

  async registerAccountPayment(dto: RegisterOperationalPaymentDto, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const workerId = await this.workerId(tx, userId);
      const method = await tx.metodoPago.findUnique({ where: { id: BigInt(dto.metodoPagoId) } });
      if (!method || !method.estado)
        throw new BadRequestException('El método de pago no está disponible');
      const operationNumber = dto.numeroOperacion?.trim();
      if (method.requiereOperacion && !operationNumber) {
        throw new BadRequestException(`Ingrese el número de operación para ${method.nombre}`);
      }
      if (dto.fechaPago && dto.fechaPago.slice(0, 10) > limaTodayKey())
        throw new BadRequestException('La fecha del pago no puede estar en el futuro');
      const paidAt = dto.fechaPago ? new Date(dto.fechaPago) : new Date();

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
          numeroOperacion: operationNumber,
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

  async updateReceivableDueDate(id: string, dto: UpdateReceivableDueDateDto) {
    return this.prisma.$transaction(async (tx) => {
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

  async returns() {
    const [sales, clientCredits] = await Promise.all([
      this.prisma.devolucionVenta.findMany({
        orderBy: { fecha: 'desc' },
        include: {
          venta: { include: { cliente: true } },
          detalles: { include: { producto: true, estadoDestino: true } },
          movimientosInventario: { orderBy: { id: 'asc' } },
          saldosFavor: true,
        },
      }),
      this.prisma.saldoFavorCliente.findMany({
        where: { montoDisponible: { gt: 0 } },
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

  async createReturn(type: string, dto: CreateReturnDto, userId?: string) {
    if (type !== 'venta') throw new BadRequestException('Tipo de devolución inválido');
    const id = await this.prisma.$transaction(async (tx) => {
      const workerId = await this.workerId(tx, userId);
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
        destino: item.reintegraInventario
          ? item.estadoDestino.nombre
          : 'No retorna al inventario',
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

  async movements(filters: MovementsFilter = {}) {
    const fecha = this.listDateRange(filters.from, filters.to);
    const detalleFilter: Prisma.DetalleMovimientoInventarioWhereInput = {};
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
  async kardex(filters: { productoId?: string; almacenId?: string; from?: string; to?: string }) {
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
      ...(almacenId ? { almacenId } : {}),
    };
    const saldoInicial = fecha?.gte
      ? await this.kardexSaldoInicial(scopeFilter, fecha.gte)
      : 0;

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
  async createSale(dto: CreateOperationalSaleDto, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const trabajadorId = await this.workerId(tx, userId);
      const warehouse = dto.almacenId
        ? await tx.almacen.findUnique({ where: { id: BigInt(dto.almacenId) } })
        : await tx.almacen.findFirst({ where: { estado: true }, orderBy: { id: 'asc' } });
      if (!warehouse || !warehouse.estado)
        throw new BadRequestException('No existe un almacén activo para registrar la venta');
      const totals = this.totals(dto.items, dto.descuento, false);
      const terms = await this.paymentTerms(tx, dto, totals.total);
      await this.validarProductosDeVenta(tx, dto.items);
      const sale = await tx.venta.create({
        data: {
          clienteId: BigInt(dto.clienteId),
          almacenOrigenId: warehouse.id,
          trabajadorId,
          tipoPago: dto.tipoPago,
          metodoPagoInicialId: terms.methodId,
          montoInicial: terms.initial,
          fechaVencimientoPago: terms.dueDate,
          estado: 'CONFIRMADA',
          observaciones: dto.observaciones,
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
      await this.applySaleOutbound(tx, sale.id);
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
      const initial =
        sale.tipoPago === 'CONTADO'
          ? Number(sale.total)
          : Math.min(Number(sale.montoInicial), Number(sale.total));
      if (initial > 0)
        await this.createInitialPayment(
          tx,
          account,
          sale.trabajadorId,
          sale.metodoPagoInicialId ?? undefined,
          initial,
        );
      const paymentState =
        initial >= Number(sale.total) ? 'PAGADA' : initial > 0 ? 'PARCIAL' : 'PENDIENTE';
      await tx.venta.update({ where: { id: sale.id }, data: { estadoPago: paymentState } });
      return this.saleView(await this.findSale(tx, sale.id));
    }, TRANSACCION_DE_STOCK);
  }

  /**
   * Edita una venta ya confirmada. Como una venta nace confirmada (no hay estado BORRADOR),
   * editar significa revertir el efecto físico del movimiento de salida original y volver a
   * aplicarlo con los datos nuevos — sin mutar ni borrar el kardex histórico (es un ledger de
   * solo-append). Restricción de seguridad: no se puede editar si ya tiene un pago registrado
   * o una devolución confirmada, para no descuadrar la cuenta por cobrar.
   */
  async updateSale(id: string, dto: UpdateOperationalSaleDto) {
    return this.prisma.$transaction(async (tx) => {
      const saleId = BigInt(id);
      const sale = await tx.venta.findUnique({
        where: { id: saleId },
        include: { cuentaCobrar: true, devoluciones: true },
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.cuentaCobrar && Number(sale.cuentaCobrar.montoPagado) > 0)
        throw new BadRequestException('No se puede editar una venta con pagos registrados');
      if (sale.devoluciones.some((item) => item.estado === 'CONFIRMADA'))
        throw new BadRequestException('No se puede editar una venta con devoluciones registradas');

      await this.reverseSaleOutbound(tx, saleId);

      const warehouse = dto.almacenId
        ? await tx.almacen.findUnique({ where: { id: BigInt(dto.almacenId) } })
        : await tx.almacen.findUnique({ where: { id: sale.almacenOrigenId } });
      if (!warehouse || !warehouse.estado)
        throw new BadRequestException('No existe un almacén activo para registrar la venta');
      const totals = this.totals(dto.items, dto.descuento, false);
      const terms = await this.paymentTerms(tx, dto, totals.total);
      await this.validarProductosDeVenta(tx, dto.items);
      await tx.venta.update({
        where: { id: saleId },
        data: {
          clienteId: BigInt(dto.clienteId),
          almacenOrigenId: warehouse.id,
          tipoPago: dto.tipoPago,
          metodoPagoInicialId: terms.methodId,
          // Editar NO registra un cobro (eso se hace desde Cobranzas), así que el "monto
          // inicial" queda en 0. Si se guardara el monto, el panel del repartidor lo sumaría
          // como dinero cobrado que en realidad nadie cobró.
          montoInicial: 0,
          fechaVencimientoPago: terms.dueDate,
          observaciones: dto.observaciones,
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

      await this.applySaleOutbound(tx, saleId, '-R');

      // El saldo pagado es 0 por la restricción de arriba, así que el nuevo saldo pendiente
      // es directamente el nuevo total, sin ambigüedad. No se re-registra un pago inicial:
      // si la venta editada pasa a ser al contado, el cobro se registra aparte, desde Cobranzas.
      // También se actualiza el vencimiento: Cobranzas lo lee de acá, no de la venta, y si no
      // se copiaba, la venta seguía apareciendo vencida después de reprogramarla.
      if (sale.cuentaCobrar) {
        await tx.cuentaCobrar.update({
          where: { id: sale.cuentaCobrar.id },
          data: {
            montoOriginal: totals.total,
            saldoPendiente: totals.total,
            fechaVencimiento: terms.dueDate,
            estado: 'PENDIENTE',
          },
        });
      }
      await tx.venta.update({ where: { id: saleId }, data: { estadoPago: 'PENDIENTE' } });

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
      if (stock) await tx.stockAlmacen.update({ where: { id: stock.id }, data: { cantidad: next } });
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
            reintegraInventario: entry.input.reintegraInventario !== false,
          })),
        },
      },
    });
    const physical = selected.filter((entry) => entry.input.reintegraInventario !== false);
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
        for (const parte of repartirEntreLotesVendidos(
          entry.detail.productoId,
          entry.quantity,
        )) {
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

  private async createInitialPayment(
    tx: Transaction,
    account: { id: bigint; montoOriginal: unknown },
    workerId: bigint,
    methodId: bigint | undefined,
    amount: number,
  ) {
    const method = methodId
      ? await tx.metodoPago.findUnique({ where: { id: methodId } })
      : await tx.metodoPago.findFirst({
          where: { estado: true, nombre: { contains: 'EFECTIVO', mode: 'insensitive' } },
        });
    if (!method?.estado) throw new BadRequestException('Seleccione un método de pago activo');
    if (method.requiereOperacion)
      throw new BadRequestException(
        `El método ${method.nombre} requiere número de operación; registre el abono desde la cuenta`,
      );
    const balance = Math.max(Number(account.montoOriginal) - amount, 0);
    await tx.pagoCliente.create({
      data: {
        cuentaCobrarId: account.id,
        metodoPagoId: method.id,
        trabajadorId: workerId,
        monto: amount,
        observaciones: 'Pago inicial de la venta',
      },
    });
    const state = balance <= 0 ? 'PAGADA' : 'PARCIAL';
    await tx.cuentaCobrar.update({
      where: { id: account.id },
      data: { montoPagado: amount, saldoPendiente: balance, estado: state },
    });
  }

  private async paymentTerms(
    tx: Transaction,
    dto: {
      tipoPago: string;
      metodoPagoId?: number;
      montoInicial?: number;
      fechaVencimiento?: string;
    },
    total: number,
  ) {
    if (total <= 0) throw new BadRequestException('El total de la operación debe ser mayor a cero');
    const isCash = dto.tipoPago === 'CONTADO';
    const initial = isCash ? total : dto.tipoPago === 'MIXTO' ? Number(dto.montoInicial ?? 0) : 0;
    if (dto.tipoPago === 'MIXTO' && (initial <= 0 || initial >= total)) {
      throw new BadRequestException('El abono inicial debe ser mayor a cero y menor que el total');
    }
    if (!isCash && !dto.fechaVencimiento) {
      throw new BadRequestException('Ingrese la fecha de vencimiento del saldo');
    }

    let dueDate: Date | null = null;
    if (dto.fechaVencimiento) {
      const dueKey = dto.fechaVencimiento.slice(0, 10);
      if (dueKey < limaTodayKey())
        throw new BadRequestException('La fecha de vencimiento no puede estar en el pasado');
      dueDate = new Date(`${dueKey}T00:00:00.000Z`);
    }

    let methodId: bigint | null = null;
    if (initial > 0) {
      if (!dto.metodoPagoId) throw new BadRequestException('Seleccione el método del pago inicial');
      const method = await tx.metodoPago.findUnique({ where: { id: BigInt(dto.metodoPagoId) } });
      if (!method?.estado) throw new BadRequestException('El método de pago no está disponible');
      if (method.requiereOperacion) {
        throw new BadRequestException(
          `El método ${method.nombre} requiere número de operación; registre el abono desde la cuenta`,
        );
      }
      methodId = method.id;
    }

    return { methodId, initial, dueDate };
  }

  private async workerId(tx: Transaction, userId?: string) {
    if (userId) {
      const linked = await tx.trabajador.findFirst({ where: { userId, estado: true } });
      if (linked) return linked.id;
    }
    const worker = await tx.trabajador.findFirst({
      where: { estado: true },
      orderBy: { id: 'asc' },
    });
    if (!worker) throw new BadRequestException('Registre un trabajador activo antes de operar');
    return worker.id;
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
      numeroOperacion: row.numeroOperacion,
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

  private findSale(tx: Transaction, id: bigint) {
    return tx.venta
      .findUnique({
        where: { id },
        include: {
          cliente: true,
          almacenOrigen: true,
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
      })
      .then((row) => row ?? Promise.reject(new NotFoundException('Venta no encontrada')));
  }

  private lineTotal(item: { cantidad: number; precioUnitario: number; descuento?: number }) {
    return Math.max(item.cantidad * item.precioUnitario - (item.descuento ?? 0), 0);
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
      pago: row.tipoPago,
      observaciones: row.observaciones,
      subtotal: Number(row.subtotal),
      igv: Number(row.igv),
      descuento: Number(row.descuento),
      total: Number(row.total),
      montoInicial: Number(row.montoInicial),
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
