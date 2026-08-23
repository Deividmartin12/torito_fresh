import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOperationalProductDto, CreateOperationalSaleDto, CreateOperationalWarehouseDto, CreatePurchaseDto, CreateReturnDto, RegisterOperationalPaymentDto } from "./operations.dto";

type Transaction = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const SALE_RECEIPT_SERIES: Record<string, readonly string[]> = {
  BOLETA: ["B001"],
  FACTURA: ["F001"],
  TICKET: ["T001"],
  NOTA: ["NC01"],
  OTRO: ["O001"],
};

const AUTOMATIC_SALE_RECEIPT = { tipoComprobante: "BOLETA", serie: "B001" } as const;
const SALE_NUMBER_LOCK = BigInt("824731");

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async catalogs() {
    const [proveedores, clientes, almacenes, productos, trabajador, estadosInventario] = await Promise.all([
      this.prisma.proveedor.findMany({ where: { estado: true }, orderBy: { razonSocial: "asc" } }),
      this.prisma.cliente.findMany({ where: { estado: true }, orderBy: { nombreLegal: "asc" } }),
      this.prisma.almacen.findMany({ where: { estado: true }, orderBy: { nombre: "asc" } }),
      this.prisma.producto.findMany({
        where: { estado: true },
        orderBy: { nombre: "asc" },
        include: { lotes: { where: { estado: "ACTIVO" }, orderBy: { fechaVencimiento: "asc" } } },
      }),
      this.prisma.trabajador.findFirst({ where: { estado: true }, orderBy: { id: "asc" } }),
      this.prisma.estadoInventario.findMany({ where: { estado: true }, orderBy: { nombre: "asc" } }),
    ]);

    return {
      proveedores: proveedores.map((item) => ({ id: item.id.toString(), nombre: item.razonSocial, documento: item.ruc })),
      clientes: clientes.map((item) => ({ id: item.id.toString(), nombre: item.nombreLegal, documento: item.numeroDocumento })),
      almacenes: almacenes.map((item) => ({ id: item.id.toString(), nombre: item.nombre, codigo: item.codigo })),
      productos: productos.map((item) => ({
        id: item.id.toString(),
        codigo: item.codigo,
        nombre: item.nombre,
        precioVenta: Number(item.precioVenta),
        costoReferencia: Number(item.costoReferencia),
        controlaLote: item.controlaLote,
        lotes: item.lotes.map((lote) => ({ id: lote.id.toString(), codigo: lote.codigoLote })),
      })),
      seriesVenta: SALE_RECEIPT_SERIES,
      estadosInventario: estadosInventario.map((item) => ({ id: item.id.toString(), nombre: item.nombre, codigo: item.codigo })),
      preparado: Boolean(trabajador && almacenes.length && productos.length),
    };
  }

  async products() {
    const rows = await this.prisma.producto.findMany({
      orderBy: { nombre: "asc" },
      include: { tipoProducto: true, stocks: true, _count: { select: { detallesVenta: true } } },
    });
    return rows.map((item) => ({
      id: item.id.toString(), codigo: item.codigo, nombre: item.nombre, tipo: item.tipoProducto.nombre,
      unidad: item.unidadMedida, capacidad: item.capacidadLitros ? `${Number(item.capacidadLitros)} L` : "-",
      precio: Number(item.precioVenta), costo: Number(item.costoReferencia),
      stock: item.stocks.reduce((total, stock) => total + Number(stock.cantidad), 0),
      lote: item.controlaLote, retornable: item.esRetornable, activo: item.estado,
      tieneVentas: item._count.detallesVenta > 0,
    }));
  }

  async createProduct(dto: CreateOperationalProductDto) {
    const codigo = dto.codigo.trim().toUpperCase();
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
        tipoProductoId: tipoProducto.id, codigo, nombre, unidadMedida: unidad,
        capacidadLitros: dto.capacidadLitros ?? null, precioVenta: dto.precio, costoReferencia: dto.costo,
        controlaLote: dto.controlaLote, esRetornable: dto.esRetornable,
      },
    });
    return { id: product.id.toString(), codigo: product.codigo, nombre: product.nombre };
  }

  async warehouses() {
    const rows = await this.prisma.almacen.findMany({ orderBy: { nombre: "asc" }, include: { responsable: true, stocks: true } });
    return rows.map((item) => ({
      id: item.id.toString(), codigo: item.codigo, nombre: item.nombre, tipo: item.tipo, direccion: item.direccion ?? "",
      responsable: item.responsable ? `${item.responsable.nombres} ${item.responsable.apellidos}` : "Sin responsable",
      productos: new Set(item.stocks.map((stock) => stock.productoId.toString())).size,
      unidades: item.stocks.reduce((sum, stock) => sum + Number(stock.cantidad), 0), activo: item.estado,
    }));
  }

  async createWarehouse(dto: CreateOperationalWarehouseDto) {
    const warehouse = await this.prisma.almacen.create({ data: {
      codigo: dto.codigo.trim().toUpperCase(), nombre: dto.nombre.trim(), tipo: dto.tipo.trim().toUpperCase(), direccion: dto.direccion?.trim() || null,
    }});
    return { id: warehouse.id.toString(), codigo: warehouse.codigo, nombre: warehouse.nombre, tipo: warehouse.tipo, direccion: warehouse.direccion ?? "", activo: warehouse.estado };
  }

  async deleteProduct(id: string) {
    let productId: bigint;
    try {
      productId = BigInt(id);
    } catch {
      throw new NotFoundException("Producto no encontrado");
    }
    const product = await this.prisma.producto.findUnique({
      where: { id: productId },
      select: { _count: { select: { detallesVenta: true } } },
    });
    if (!product) throw new NotFoundException("Producto no encontrado");
    if (product._count.detallesVenta > 0) {
      throw new BadRequestException("No se puede eliminar un producto ligado a una venta");
    }
    await this.prisma.producto.delete({ where: { id: productId } });
    return { message: "Producto eliminado" };
  }

  async purchases() {
    const rows = await this.prisma.compra.findMany({
      orderBy: { fecha: "desc" },
      take: 100,
      include: { proveedor: true, almacenDestino: true, detalles: { include: { producto: true, detallesDevolucion: { where: { devolucionCompra: { estado: "CONFIRMADA" } } } } }, cuentaPagar: true, devoluciones: true, movimientosInventario: true },
    });
    return rows.map((row) => this.purchaseView(row));
  }

  async sales() {
    const rows = await this.prisma.venta.findMany({
      orderBy: { fecha: "desc" },
      take: 100,
      include: { cliente: true, almacenOrigen: true, detalles: { include: { producto: true, detallesDevolucion: { where: { devolucionVenta: { estado: "CONFIRMADA" } } } } }, cuentaCobrar: true, devoluciones: true, movimientosInventario: true },
    });
    return rows.map((row) => this.saleView(row));
  }

  async stock(almacenId?: string) {
    const rows = await this.prisma.stockAlmacen.findMany({
      where: almacenId ? { almacenId: BigInt(almacenId) } : undefined,
      orderBy: [{ almacen: { nombre: "asc" } }, { producto: { nombre: "asc" } }],
      include: { producto: { include: { tipoProducto: true } }, almacen: true, lote: true, estadoInventario: true },
    });
    return rows.map((row) => ({
      id: row.id.toString(),
      producto: row.producto.nombre,
      codigo: row.producto.codigo,
      categoria: row.producto.tipoProducto.nombre,
      almacen: row.almacen.nombre,
      almacenTipo: row.almacen.tipo,
      lote: row.lote?.codigoLote ?? "Sin lote",
      estado: row.estadoInventario.codigo,
      vendible: row.estadoInventario.estado && row.estadoInventario.permiteVenta,
      cantidad: Number(row.cantidad),
      reservada: Number(row.cantidadReservada),
      minimo: Number(row.stockMinimo),
      costo: Number(row.costoPromedio),
    }));
  }

  async paymentMethods() {
    const rows = await this.prisma.metodoPago.findMany({ where: { estado: true }, orderBy: { nombre: "asc" } });
    return rows.map((row) => ({
      id: row.id.toString(),
      nombre: row.nombre,
      requiereOperacion: row.requiereOperacion,
    }));
  }

  async accounts(type: string) {
    this.ensureAccountType(type);
    if (type === "cobrar") {
      const rows = await this.prisma.cuentaCobrar.findMany({
        orderBy: { fechaEmision: "desc" },
        include: {
          cliente: true,
          venta: true,
          pagos: { orderBy: { fechaPago: "desc" }, include: { metodoPago: true, trabajador: true } },
        },
      });
      return rows.map((row) => this.receivableView(row));
    }

    const rows = await this.prisma.cuentaPagar.findMany({
      orderBy: { fechaEmision: "desc" },
      include: {
        compra: { include: { proveedor: true } },
        pagos: { orderBy: { fechaPago: "desc" }, include: { metodoPago: true, trabajador: true } },
      },
    });
    return rows.map((row) => this.payableView(row));
  }

  async registerAccountPayment(type: string, dto: RegisterOperationalPaymentDto) {
    this.ensureAccountType(type);
    return this.prisma.$transaction(async (tx) => {
      const workerId = await this.workerId(tx);
      const method = await tx.metodoPago.findUnique({ where: { id: BigInt(dto.metodoPagoId) } });
      if (!method || !method.estado) throw new BadRequestException("El método de pago no está disponible");
      const operationNumber = dto.numeroOperacion?.trim();
      if (method.requiereOperacion && !operationNumber) {
        throw new BadRequestException(`Ingrese el número de operación para ${method.nombre}`);
      }
      const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (dto.fechaPago && dto.fechaPago.slice(0, 10) > todayKey) throw new BadRequestException("La fecha del pago no puede estar en el futuro");
      const paidAt = dto.fechaPago ? new Date(dto.fechaPago) : new Date();

      if (type === "cobrar") {
        const account = await tx.cuentaCobrar.findUnique({ where: { id: BigInt(dto.cuentaId) } });
        if (!account) throw new NotFoundException("Cuenta por cobrar no encontrada");
        const balance = Number(account.saldoPendiente);
        if (balance <= 0) throw new BadRequestException("La cuenta ya está pagada");
        if (dto.monto > balance) throw new BadRequestException("El pago supera el saldo pendiente");
        const newBalance = Math.max(balance - dto.monto, 0);
        await tx.pagoCliente.create({ data: {
          cuentaCobrarId: account.id, metodoPagoId: method.id, trabajadorId: workerId,
          fechaPago: paidAt, monto: dto.monto, numeroOperacion: operationNumber,
          observaciones: dto.observaciones?.trim(),
        }});
        await tx.cuentaCobrar.update({ where: { id: account.id }, data: {
          montoPagado: Number(account.montoPagado) + dto.monto,
          saldoPendiente: newBalance,
          estado: newBalance <= 0 ? "PAGADA" : "PARCIAL",
        }});
        await tx.venta.update({ where: { id: account.ventaId }, data: { estadoPago: newBalance <= 0 ? "PAGADA" : "PARCIAL" } });
      } else {
        const account = await tx.cuentaPagar.findUnique({ where: { id: BigInt(dto.cuentaId) } });
        if (!account) throw new NotFoundException("Cuenta por pagar no encontrada");
        const balance = Number(account.saldoPendiente);
        if (balance <= 0) throw new BadRequestException("La cuenta ya está pagada");
        if (dto.monto > balance) throw new BadRequestException("El pago supera el saldo pendiente");
        const newBalance = Math.max(balance - dto.monto, 0);
        await tx.pagoProveedor.create({ data: {
          cuentaPagarId: account.id, metodoPagoId: method.id, trabajadorId: workerId,
          fechaPago: paidAt, monto: dto.monto, numeroOperacion: operationNumber,
          observaciones: dto.observaciones?.trim(),
        }});
        await tx.cuentaPagar.update({ where: { id: account.id }, data: {
          montoPagado: Number(account.montoPagado) + dto.monto,
          saldoPendiente: newBalance,
          estado: newBalance <= 0 ? "PAGADA" : "PARCIAL",
        }});
        await tx.compra.update({ where: { id: account.compraId }, data: { estadoPago: newBalance <= 0 ? "PAGADA" : "PARCIAL" } });
      }

      const accounts = await this.accountsInTransaction(tx, type);
      return accounts.find((account) => account.id === dto.cuentaId.toString());
    });
  }

  async returns() {
    const [sales, purchases, clientCredits, supplierCredits] = await Promise.all([
      this.prisma.devolucionVenta.findMany({ orderBy: { fecha: "desc" }, include: { venta: { include: { cliente: true } }, detalles: { include: { producto: true, estadoDestino: true } }, movimientosInventario: true, saldosFavor: true } }),
      this.prisma.devolucionCompra.findMany({ orderBy: { fecha: "desc" }, include: { compra: { include: { proveedor: true } }, detalles: { include: { producto: true } }, movimientosInventario: true, saldosFavor: true } }),
      this.prisma.saldoFavorCliente.findMany({ where: { montoDisponible: { gt: 0 } }, include: { cliente: true }, orderBy: { createdAt: "desc" } }),
      this.prisma.saldoFavorProveedor.findMany({ where: { montoDisponible: { gt: 0 } }, include: { proveedor: true }, orderBy: { createdAt: "desc" } }),
    ]);
    return {
      devoluciones: [
        ...sales.map((row) => ({ id: row.id.toString(), codigo: row.codigo, tipo: "VENTA", fecha: row.fecha, operacionId: row.ventaId.toString(), comprobante: `${row.venta.tipoComprobante} ${row.venta.serie}-${row.venta.numero}`, tercero: row.venta.cliente.nombreLegal, motivo: row.motivo, total: Number(row.total), estado: row.estado, kardexId: row.movimientosInventario[0]?.id?.toString() ?? null, saldoFavor: row.saldosFavor.reduce((sum, credit) => sum + Number(credit.montoOriginal), 0), items: row.detalles.map((item) => ({ producto: item.producto.nombre, cantidad: Number(item.cantidad), importe: Number(item.subtotal), destino: item.reintegraInventario ? item.estadoDestino.nombre : "No retorna al inventario" })) })),
        ...purchases.map((row) => ({ id: row.id.toString(), codigo: row.codigo, tipo: "COMPRA", fecha: row.fecha, operacionId: row.compraId.toString(), comprobante: `${row.compra.tipoComprobante} ${row.compra.serie}-${row.compra.numero}`, tercero: row.compra.proveedor.razonSocial, motivo: row.motivo, total: Number(row.total), estado: row.estado, kardexId: row.movimientosInventario[0]?.id?.toString() ?? null, saldoFavor: row.saldosFavor.reduce((sum, credit) => sum + Number(credit.montoOriginal), 0), items: row.detalles.map((item) => ({ producto: item.producto.nombre, cantidad: Number(item.cantidad), importe: Number(item.subtotal), destino: "Proveedor" })) })),
      ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
      saldosFavor: [
        ...clientCredits.map((row) => ({ id: `C-${row.id}`, tipo: "CLIENTE", tercero: row.cliente.nombreLegal, original: Number(row.montoOriginal), disponible: Number(row.montoDisponible), estado: row.estado, fecha: row.createdAt })),
        ...supplierCredits.map((row) => ({ id: `P-${row.id}`, tipo: "PROVEEDOR", tercero: row.proveedor.razonSocial, original: Number(row.montoOriginal), disponible: Number(row.montoDisponible), estado: row.estado, fecha: row.createdAt })),
      ],
    };
  }

  async createReturn(type: string, dto: CreateReturnDto) {
    if (type !== "venta" && type !== "compra") throw new BadRequestException("Tipo de devolución inválido");
    const id = await this.prisma.$transaction(async (tx) => {
      const workerId = await this.workerId(tx);
      return type === "venta" ? this.createSaleReturnTx(tx, dto, workerId) : this.createPurchaseReturnTx(tx, dto, workerId);
    });
    const data = await this.returns();
    return data.devoluciones.find((item) => item.tipo === type.toUpperCase() && item.id === id.toString());
  }

  async movements() {
    const rows = await this.prisma.movimientoInventario.findMany({
      orderBy: { fecha: "desc" },
      take: 200,
      include: {
        almacenOrigen: true,
        almacenDestino: true,
        trabajador: true,
        compra: { include: { proveedor: true } },
        venta: { include: { cliente: true } },
        ordenProduccion: { include: { producto: true } },
        detalles: { include: { producto: true, almacen: true, lote: true, estadoInventario: true } },
      },
    });
    return rows.map((row) => {
      const document = row.venta
        ? `${row.venta.tipoComprobante} ${row.venta.serie}-${row.venta.numero}`
        : row.compra
          ? `${row.compra.tipoComprobante} ${row.compra.serie}-${row.compra.numero}`
          : row.ordenProduccion
            ? `ORDEN ${row.ordenProduccion.codigo}`
            : row.numeroReferencia ?? "Movimiento manual";
      const thirdParty = row.venta?.cliente.nombreLegal ?? row.compra?.proveedor.razonSocial ?? (row.ordenProduccion ? `Producción · ${row.ordenProduccion.producto.nombre}` : "Movimiento interno");
      const origin = row.almacenOrigen?.nombre ?? (row.compra ? `Proveedor · ${thirdParty}` : "Origen externo");
      const destination = row.almacenDestino?.nombre ?? (row.venta ? `Cliente · ${thirdParty}` : "Destino externo");
      const units = row.detalles
        .filter((item) => row.tipoMovimiento !== "PRODUCCION" || item.direccion === "ENTRADA")
        .reduce((sum, item) => sum + Number(item.cantidad), 0);
      const explanation = row.tipoMovimiento === "PRODUCCION"
        ? `Se consumieron insumos y se generaron ${units} unidades de producto terminado.`
        : row.tipoMovimiento === "ENTRADA"
        ? `Ingresaron ${units} unidades al inventario por una ${row.tipoOperacion.toLowerCase()}.`
        : row.tipoMovimiento === "SALIDA"
          ? `Salieron ${units} unidades del inventario por una ${row.tipoOperacion.toLowerCase()}.`
          : `Se trasladaron ${units} unidades entre ubicaciones.`;
      return {
        id: row.id.toString(),
        referencia: row.numeroReferencia ?? `MOV-${row.id.toString().padStart(6, "0")}`,
        fecha: row.fecha,
        tipo: row.tipoMovimiento,
        operacion: row.tipoOperacion,
        comprobante: document,
        tercero: thirdParty,
        explicacion: explanation,
        observaciones: row.observaciones,
        responsable: `${row.trabajador.nombres} ${row.trabajador.apellidos}`,
        origen: origin,
        destino: destination,
        estado: row.estado,
        unidades: units,
        detalles: row.detalles.map((item) => ({
          producto: item.producto.nombre,
          codigo: item.producto.codigo,
          almacen: item.almacen.nombre,
          lote: item.lote?.codigoLote ?? "Sin lote",
          estadoInventario: item.estadoInventario.nombre,
          direccion: item.direccion,
          cantidad: Number(item.cantidad),
          costoUnitario: Number(item.costoUnitario),
          costoTotal: Number(item.costoTotal),
          saldoAnterior: Number(item.saldoAnterior),
          saldoPosterior: Number(item.saldoPosterior),
        })),
      };
    });
  }

  async createPurchase(dto: CreatePurchaseDto, confirm = false) {
    return this.prisma.$transaction(async (tx) => {
      const trabajadorId = await this.workerId(tx);
      const totals = this.totals(dto.items, dto.descuento);
      const terms = await this.paymentTerms(tx, dto, totals.total);
      const purchase = await tx.compra.create({
        data: {
          proveedorId: BigInt(dto.proveedorId), almacenDestinoId: BigInt(dto.almacenId), trabajadorId,
          tipoComprobante: dto.tipoComprobante, serie: dto.serie.trim().toUpperCase(), numero: dto.numero.trim(),
          tipoPago: dto.tipoPago, metodoPagoInicialId: terms.methodId, montoInicial: terms.initial,
          fechaVencimientoPago: terms.dueDate, estado: "BORRADOR", observaciones: dto.observaciones,
          subtotal: totals.subtotal, igv: totals.igv, descuento: totals.descuento, total: totals.total,
          detalles: { create: dto.items.map((item) => ({
            productoId: BigInt(item.productoId), loteId: item.loteId ? BigInt(item.loteId) : null,
            cantidad: item.cantidad, costoUnitario: item.precioUnitario, descuento: item.descuento ?? 0,
            subtotal: this.lineTotal(item),
          })) },
        },
        include: { proveedor: true, almacenDestino: true, detalles: { include: { producto: true } }, movimientosInventario: true },
      });
      if (confirm) await this.confirmPurchaseTx(tx, purchase.id);
      const result = await this.findPurchase(tx, purchase.id);
      return this.purchaseView(result);
    });
  }

  async confirmPurchase(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.confirmPurchaseTx(tx, BigInt(id));
      return this.purchaseView(await this.findPurchase(tx, BigInt(id)));
    });
  }

  async createSale(dto: CreateOperationalSaleDto, confirm = false) {
    return this.prisma.$transaction(async (tx) => {
      const trabajadorId = await this.workerId(tx);
      const warehouse = dto.almacenId
        ? await tx.almacen.findUnique({ where: { id: BigInt(dto.almacenId) } })
        : await tx.almacen.findFirst({ where: { estado: true }, orderBy: { id: "asc" } });
      if (!warehouse || !warehouse.estado) throw new BadRequestException("No existe un almacén activo para registrar la venta");
      const totals = this.totals(dto.items, dto.descuento, false);
      const terms = await this.paymentTerms(tx, dto, totals.total);
      const numero = await this.nextSaleNumber(tx);
      const sale = await tx.venta.create({
        data: {
          clienteId: BigInt(dto.clienteId), almacenOrigenId: warehouse.id, trabajadorId,
          ...AUTOMATIC_SALE_RECEIPT, numero,
          tipoPago: dto.tipoPago, metodoPagoInicialId: terms.methodId, montoInicial: terms.initial,
          fechaVencimientoPago: terms.dueDate, estado: "BORRADOR", observaciones: dto.observaciones,
          subtotal: totals.subtotal, igv: totals.igv, descuento: totals.descuento, total: totals.total,
          detalles: { create: dto.items.map((item) => ({
            productoId: BigInt(item.productoId), loteId: item.loteId ? BigInt(item.loteId) : null,
            cantidad: item.cantidad, precioUnitario: item.precioUnitario, descuento: item.descuento ?? 0,
            subtotal: this.lineTotal(item),
          })) },
        },
        include: { cliente: true, almacenOrigen: true, detalles: { include: { producto: true } }, cuentaCobrar: true, movimientosInventario: true },
      });
      if (confirm) await this.confirmSaleTx(tx, sale.id);
      return this.saleView(await this.findSale(tx, sale.id));
    });
  }

  async confirmSale(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.confirmSaleTx(tx, BigInt(id));
      return this.saleView(await this.findSale(tx, BigInt(id)));
    });
  }

  private async confirmPurchaseTx(tx: Transaction, id: bigint) {
    const purchase = await this.findPurchase(tx, id);
    if (purchase.estado !== "BORRADOR") throw new BadRequestException("La compra ya fue procesada");
    const available = await this.availableState(tx);
    const movement = await tx.movimientoInventario.create({ data: {
      tipoMovimiento: "ENTRADA", tipoOperacion: "COMPRA", almacenDestinoId: purchase.almacenDestinoId,
      compraId: purchase.id, trabajadorId: purchase.trabajadorId, estado: "CONFIRMADO",
      numeroReferencia: `COM-${purchase.id.toString().padStart(6, "0")}`,
      observaciones: `Ingreso automatico por ${purchase.tipoComprobante} ${purchase.serie}-${purchase.numero}`,
    }});
    for (const item of purchase.detalles) {
      const stock = await this.stockRow(tx, item.productoId, purchase.almacenDestinoId, item.loteId, available.id);
      const previous = stock ? Number(stock.cantidad) : 0;
      const next = previous + Number(item.cantidad);
      const previousValue = previous * Number(stock?.costoPromedio ?? 0);
      const nextCost = next ? (previousValue + Number(item.cantidad) * Number(item.costoUnitario)) / next : 0;
      if (stock) await tx.stockAlmacen.update({ where: { id: stock.id }, data: { cantidad: next, costoPromedio: nextCost } });
      else await tx.stockAlmacen.create({ data: {
        productoId: item.productoId, almacenId: purchase.almacenDestinoId, loteId: item.loteId,
        estadoInventarioId: available.id, cantidad: next, costoPromedio: nextCost,
      }});
      await tx.detalleMovimientoInventario.create({ data: {
        movimientoId: movement.id, productoId: item.productoId, almacenId: purchase.almacenDestinoId,
        loteId: item.loteId, estadoInventarioId: available.id, direccion: "ENTRADA", cantidad: item.cantidad,
        costoUnitario: item.costoUnitario, costoTotal: Number(item.cantidad) * Number(item.costoUnitario),
        saldoAnterior: previous, saldoPosterior: next,
      }});
    }
    const account = await tx.cuentaPagar.create({ data: {
      compraId: purchase.id, montoOriginal: purchase.total, saldoPendiente: purchase.total,
      fechaEmision: purchase.fecha, fechaVencimiento: purchase.fechaVencimientoPago, estado: "PENDIENTE",
    }});
    const initial = purchase.tipoPago === "CONTADO" ? Number(purchase.total) : Math.min(Number(purchase.montoInicial), Number(purchase.total));
    if (initial > 0) await this.createInitialPayment(tx, "pagar", account, purchase.trabajadorId, purchase.metodoPagoInicialId ?? undefined, initial);
    const paymentState = initial >= Number(purchase.total) ? "PAGADA" : initial > 0 ? "PARCIAL" : "PENDIENTE";
    await tx.compra.update({ where: { id }, data: { estado: "CONFIRMADA", estadoPago: paymentState } });
  }

  private async confirmSaleTx(tx: Transaction, id: bigint) {
    const sale = await this.findSale(tx, id);
    if (sale.estado !== "BORRADOR") throw new BadRequestException("La venta ya fue procesada");
    const movement = await tx.movimientoInventario.create({ data: {
      tipoMovimiento: "SALIDA", tipoOperacion: "VENTA", almacenOrigenId: sale.almacenOrigenId,
      ventaId: sale.id, trabajadorId: sale.trabajadorId, estado: "CONFIRMADO",
      numeroReferencia: `VEN-${sale.id.toString().padStart(6, "0")}`,
      observaciones: `Salida automatica por ${sale.tipoComprobante} ${sale.serie}-${sale.numero}`,
    }});
    for (const item of sale.detalles) {
      const stocks = await this.saleableStockRows(tx, item.productoId, sale.almacenOrigenId, item.loteId);
      const free = stocks.reduce((total, stock) => total + Math.max(Number(stock.cantidad) - Number(stock.cantidadReservada), 0), 0);
      if (free < Number(item.cantidad)) {
        throw new BadRequestException(`Stock insuficiente para ${item.producto.nombre}. Disponible: ${free}`);
      }
      let remaining = Number(item.cantidad);
      for (const stock of stocks) {
        const previous = Number(stock.cantidad);
        const take = Math.min(Math.max(previous - Number(stock.cantidadReservada), 0), remaining);
        if (take <= 0) continue;
        const next = previous - take;
        await tx.stockAlmacen.update({ where: { id: stock.id }, data: { cantidad: next } });
        await tx.detalleMovimientoInventario.create({ data: {
          movimientoId: movement.id, productoId: item.productoId, almacenId: sale.almacenOrigenId,
          loteId: stock.loteId, estadoInventarioId: stock.estadoInventarioId, direccion: "SALIDA", cantidad: take,
          costoUnitario: stock.costoPromedio, costoTotal: take * Number(stock.costoPromedio),
          saldoAnterior: previous, saldoPosterior: next,
        }});
        remaining -= take;
        if (remaining <= 0) break;
      }
    }
    const account = await tx.cuentaCobrar.create({ data: {
      ventaId: sale.id, clienteId: sale.clienteId, montoOriginal: sale.total, saldoPendiente: sale.total,
      fechaEmision: sale.fecha, fechaVencimiento: sale.fechaVencimientoPago, estado: "PENDIENTE",
    }});
    const initial = sale.tipoPago === "CONTADO" ? Number(sale.total) : Math.min(Number(sale.montoInicial), Number(sale.total));
    if (initial > 0) await this.createInitialPayment(tx, "cobrar", account, sale.trabajadorId, sale.metodoPagoInicialId ?? undefined, initial);
    const paymentState = initial >= Number(sale.total) ? "PAGADA" : initial > 0 ? "PARCIAL" : "PENDIENTE";
    await tx.venta.update({ where: { id }, data: { estado: "CONFIRMADA", estadoPago: paymentState } });
  }

  private async createSaleReturnTx(tx: Transaction, dto: CreateReturnDto, workerId: bigint) {
    const sale = await tx.venta.findUnique({ where: { id: BigInt(dto.operacionId) }, include: {
      cuentaCobrar: true,
      detalles: { include: { producto: true, detallesDevolucion: { where: { devolucionVenta: { estado: "CONFIRMADA" } } } } },
    }});
    if (!sale || sale.estado !== "CONFIRMADA") throw new BadRequestException("Solo se puede devolver una venta confirmada");
    if (!sale.cuentaCobrar) throw new BadRequestException("La venta no tiene su cuenta por cobrar principal");
    const selected = this.validateReturnItems(sale.detalles, dto.items);
    const defaultState = await this.availableState(tx);
    const total = selected.reduce((sum, entry) => sum + this.returnLineAmount(entry.detail, entry.quantity, Number(sale.subtotal), Number(sale.total)), 0);
    const code = `DV-${Date.now().toString(36).toUpperCase()}`;
    const created = await tx.devolucionVenta.create({ data: {
      ventaId: sale.id, trabajadorId: workerId, codigo: code, motivo: dto.motivo.trim(), observaciones: dto.observaciones?.trim(), total, estado: "CONFIRMADA",
      detalles: { create: selected.map((entry) => ({
        detalleVentaId: entry.detail.id, productoId: entry.detail.productoId, loteId: entry.detail.loteId,
        cantidad: entry.quantity, precioUnitario: entry.detail.precioUnitario,
        subtotal: this.returnLineAmount(entry.detail, entry.quantity, Number(sale.subtotal), Number(sale.total)),
        estadoDestinoId: entry.input.estadoDestinoId ? BigInt(entry.input.estadoDestinoId) : defaultState.id, reintegraInventario: entry.input.reintegraInventario !== false,
      })) },
    }});
    const physical = selected.filter((entry) => entry.input.reintegraInventario !== false);
    if (physical.length) {
      for (const entry of physical) {
        const state = await tx.estadoInventario.findUnique({ where: { id: BigInt(entry.input.estadoDestinoId ?? 0) } });
        if (!state?.estado) throw new BadRequestException("Seleccione un estado de inventario válido para cada producto devuelto");
      }
      const movement = await tx.movimientoInventario.create({ data: { tipoMovimiento: "ENTRADA", tipoOperacion: "DEVOLUCION_VENTA", almacenDestinoId: sale.almacenOrigenId, devolucionVentaId: created.id, trabajadorId: workerId, estado: "CONFIRMADO", numeroReferencia: code, observaciones: `Ingreso por devolución de ${sale.serie}-${sale.numero}` } });
      for (const entry of physical) {
        const stateId = entry.input.estadoDestinoId ? BigInt(entry.input.estadoDestinoId) : defaultState.id;
        const stock = await this.stockRow(tx, entry.detail.productoId, sale.almacenOrigenId, entry.detail.loteId, stateId);
        const previous = Number(stock?.cantidad ?? 0);
        const next = previous + entry.quantity;
        if (stock) await tx.stockAlmacen.update({ where: { id: stock.id }, data: { cantidad: next } });
        else await tx.stockAlmacen.create({ data: { productoId: entry.detail.productoId, almacenId: sale.almacenOrigenId, loteId: entry.detail.loteId, estadoInventarioId: stateId, cantidad: next } });
        await tx.detalleMovimientoInventario.create({ data: { movimientoId: movement.id, productoId: entry.detail.productoId, almacenId: sale.almacenOrigenId, loteId: entry.detail.loteId, estadoInventarioId: stateId, direccion: "ENTRADA", cantidad: entry.quantity, costoUnitario: 0, costoTotal: 0, saldoAnterior: previous, saldoPosterior: next } });
      }
    }
    const previousBalance = Number(sale.cuentaCobrar.saldoPendiente);
    const newBalance = Math.max(previousBalance - total, 0);
    const credit = Math.max(total - previousBalance, 0);
    const paymentState = newBalance <= 0 ? "PAGADA" : Number(sale.cuentaCobrar.montoPagado) > 0 ? "PARCIAL" : "PENDIENTE";
    await tx.cuentaCobrar.update({ where: { id: sale.cuentaCobrar.id }, data: { saldoPendiente: newBalance, estado: paymentState } });
    if (credit > 0) await tx.saldoFavorCliente.create({ data: { clienteId: sale.clienteId, devolucionVentaId: created.id, montoOriginal: credit, montoDisponible: credit } });
    const fullyReturned = this.isFullyReturned(sale.detalles, selected);
    await tx.venta.update({ where: { id: sale.id }, data: { estadoPago: paymentState, estadoDevolucion: fullyReturned ? "DEVOLUCION_TOTAL" : "DEVOLUCION_PARCIAL" } });
    return created.id;
  }

  private async createPurchaseReturnTx(tx: Transaction, dto: CreateReturnDto, workerId: bigint) {
    const purchase = await tx.compra.findUnique({ where: { id: BigInt(dto.operacionId) }, include: {
      cuentaPagar: true,
      detalles: { include: { producto: true, detallesDevolucion: { where: { devolucionCompra: { estado: "CONFIRMADA" } } } } },
    }});
    if (!purchase || purchase.estado !== "CONFIRMADA") throw new BadRequestException("Solo se puede devolver una compra confirmada");
    if (!purchase.cuentaPagar) throw new BadRequestException("La compra no tiene su cuenta por pagar principal");
    const selected = this.validateReturnItems(purchase.detalles, dto.items);
    const total = selected.reduce((sum, entry) => sum + this.returnLineAmount(entry.detail, entry.quantity, Number(purchase.subtotal), Number(purchase.total)), 0);
    const code = `DC-${Date.now().toString(36).toUpperCase()}`;
    const created = await tx.devolucionCompra.create({ data: {
      compraId: purchase.id, trabajadorId: workerId, codigo: code, motivo: dto.motivo.trim(), observaciones: dto.observaciones?.trim(), total, estado: "CONFIRMADA",
      detalles: { create: selected.map((entry) => ({ detalleCompraId: entry.detail.id, productoId: entry.detail.productoId, loteId: entry.detail.loteId, cantidad: entry.quantity, costoUnitario: entry.detail.costoUnitario, subtotal: this.returnLineAmount(entry.detail, entry.quantity, Number(purchase.subtotal), Number(purchase.total)) })) },
    }});
    const available = await this.availableState(tx);
    const movement = await tx.movimientoInventario.create({ data: { tipoMovimiento: "SALIDA", tipoOperacion: "DEVOLUCION_COMPRA", almacenOrigenId: purchase.almacenDestinoId, devolucionCompraId: created.id, trabajadorId: workerId, estado: "CONFIRMADO", numeroReferencia: code, observaciones: `Salida por devolución de ${purchase.serie}-${purchase.numero}` } });
    for (const entry of selected) {
      const stock = await this.stockRow(tx, entry.detail.productoId, purchase.almacenDestinoId, entry.detail.loteId, available.id);
      const previous = Number(stock?.cantidad ?? 0);
      if (!stock || previous - Number(stock.cantidadReservada) < entry.quantity) throw new BadRequestException(`Stock insuficiente para devolver ${entry.detail.producto.nombre}`);
      const next = previous - entry.quantity;
      await tx.stockAlmacen.update({ where: { id: stock.id }, data: { cantidad: next } });
      await tx.detalleMovimientoInventario.create({ data: { movimientoId: movement.id, productoId: entry.detail.productoId, almacenId: purchase.almacenDestinoId, loteId: entry.detail.loteId, estadoInventarioId: available.id, direccion: "SALIDA", cantidad: entry.quantity, costoUnitario: entry.detail.costoUnitario, costoTotal: entry.quantity * Number(entry.detail.costoUnitario), saldoAnterior: previous, saldoPosterior: next } });
    }
    const previousBalance = Number(purchase.cuentaPagar.saldoPendiente);
    const newBalance = Math.max(previousBalance - total, 0);
    const credit = Math.max(total - previousBalance, 0);
    const paymentState = newBalance <= 0 ? "PAGADA" : Number(purchase.cuentaPagar.montoPagado) > 0 ? "PARCIAL" : "PENDIENTE";
    await tx.cuentaPagar.update({ where: { id: purchase.cuentaPagar.id }, data: { saldoPendiente: newBalance, estado: paymentState } });
    if (credit > 0) await tx.saldoFavorProveedor.create({ data: { proveedorId: purchase.proveedorId, devolucionCompraId: created.id, montoOriginal: credit, montoDisponible: credit } });
    const fullyReturned = this.isFullyReturned(purchase.detalles, selected);
    await tx.compra.update({ where: { id: purchase.id }, data: { estadoPago: paymentState, estadoDevolucion: fullyReturned ? "DEVOLUCION_TOTAL" : "DEVOLUCION_PARCIAL" } });
    return created.id;
  }

  private validateReturnItems(details: any[], items: CreateReturnDto["items"]) {
    const seen = new Set<number>();
    return items.map((input) => {
      if (seen.has(input.detalleId)) throw new BadRequestException("No repita un producto en la devolución");
      seen.add(input.detalleId);
      const detail = details.find((item) => item.id === BigInt(input.detalleId));
      if (!detail) throw new BadRequestException("Un producto no pertenece a la operación original");
      const returned = detail.detallesDevolucion.reduce((sum: number, item: any) => sum + Number(item.cantidad), 0);
      if (input.cantidad > Number(detail.cantidad) - returned) throw new BadRequestException(`La cantidad devuelta supera lo disponible para ${detail.producto.nombre}`);
      return { detail, input, quantity: input.cantidad };
    });
  }

  private returnLineAmount(detail: any, quantity: number, subtotal: number, total: number) {
    const taxFactor = subtotal > 0 ? total / subtotal : 1;
    return Math.round((Number(detail.subtotal) / Number(detail.cantidad)) * quantity * taxFactor * 100) / 100;
  }

  private isFullyReturned(details: any[], selected: { detail: any; quantity: number }[]) {
    return details.every((detail) => {
      const previous = detail.detallesDevolucion.reduce((sum: number, item: any) => sum + Number(item.cantidad), 0);
      const current = selected.find((item) => item.detail.id === detail.id)?.quantity ?? 0;
      return previous + current >= Number(detail.cantidad);
    });
  }

  private async createInitialPayment(tx: Transaction, type: "cobrar" | "pagar", account: any, workerId: bigint, methodId: bigint | undefined, amount: number) {
    const method = methodId
      ? await tx.metodoPago.findUnique({ where: { id: methodId } })
      : await tx.metodoPago.findFirst({ where: { estado: true, nombre: { contains: "EFECTIVO", mode: "insensitive" } } });
    if (!method?.estado) throw new BadRequestException("Seleccione un método de pago activo");
    if (method.requiereOperacion) throw new BadRequestException(`El método ${method.nombre} requiere número de operación; registre el abono desde la cuenta`);
    const balance = Math.max(Number(account.montoOriginal) - amount, 0);
    if (type === "cobrar") await tx.pagoCliente.create({ data: { cuentaCobrarId: account.id, metodoPagoId: method.id, trabajadorId: workerId, monto: amount, observaciones: "Pago inicial de la venta" } });
    else await tx.pagoProveedor.create({ data: { cuentaPagarId: account.id, metodoPagoId: method.id, trabajadorId: workerId, monto: amount, observaciones: "Pago inicial de la compra" } });
    const state = balance <= 0 ? "PAGADA" : "PARCIAL";
    if (type === "cobrar") await tx.cuentaCobrar.update({ where: { id: account.id }, data: { montoPagado: amount, saldoPendiente: balance, estado: state } });
    else await tx.cuentaPagar.update({ where: { id: account.id }, data: { montoPagado: amount, saldoPendiente: balance, estado: state } });
  }

  private async paymentTerms(
    tx: Transaction,
    dto: { tipoPago: string; metodoPagoId?: number; montoInicial?: number; fechaVencimiento?: string },
    total: number,
  ) {
    if (total <= 0) throw new BadRequestException("El total de la operación debe ser mayor a cero");
    const isCash = dto.tipoPago === "CONTADO";
    const initial = isCash ? total : dto.tipoPago === "MIXTO" ? Number(dto.montoInicial ?? 0) : 0;
    if (dto.tipoPago === "MIXTO" && (initial <= 0 || initial >= total)) {
      throw new BadRequestException("El abono inicial debe ser mayor a cero y menor que el total");
    }
    if (!isCash && !dto.fechaVencimiento) {
      throw new BadRequestException("Ingrese la fecha de vencimiento del saldo");
    }

    let dueDate: Date | null = null;
    if (dto.fechaVencimiento) {
      const dueKey = dto.fechaVencimiento.slice(0, 10);
      const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (dueKey < todayKey) throw new BadRequestException("La fecha de vencimiento no puede estar en el pasado");
      dueDate = new Date(`${dueKey}T00:00:00.000Z`);
    }

    let methodId: bigint | null = null;
    if (initial > 0) {
      if (!dto.metodoPagoId) throw new BadRequestException("Seleccione el método del pago inicial");
      const method = await tx.metodoPago.findUnique({ where: { id: BigInt(dto.metodoPagoId) } });
      if (!method?.estado) throw new BadRequestException("El método de pago no está disponible");
      if (method.requiereOperacion) {
        throw new BadRequestException(`El método ${method.nombre} requiere número de operación; registre el abono desde la cuenta`);
      }
      methodId = method.id;
    }

    return { methodId, initial, dueDate };
  }

  private async workerId(tx: Transaction) {
    const worker = await tx.trabajador.findFirst({ where: { estado: true }, orderBy: { id: "asc" } });
    if (!worker) throw new BadRequestException("Registre un trabajador activo antes de operar");
    return worker.id;
  }

  private async nextSaleNumber(tx: Transaction) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SALE_NUMBER_LOCK})`;
    const previousSales = await tx.venta.findMany({
      where: AUTOMATIC_SALE_RECEIPT,
      select: { numero: true },
    });
    const lastNumber = previousSales.reduce((largest, sale) => {
      if (!/^\d+$/.test(sale.numero)) return largest;
      const current = BigInt(sale.numero);
      return current > largest ? current : largest;
    }, BigInt(0));
    const nextNumber = (lastNumber + BigInt(1)).toString().padStart(6, "0");
    if (nextNumber.length > 20) throw new BadRequestException("Se alcanzó el límite de numeración automática de ventas");
    return nextNumber;
  }

  private async availableState(tx: Transaction) {
    const state = await tx.estadoInventario.findUnique({ where: { codigo: "DISPONIBLE" } });
    if (!state) throw new BadRequestException("No existe el estado de inventario DISPONIBLE");
    return state;
  }

  private ensureAccountType(type: string) {
    if (type !== "cobrar" && type !== "pagar") throw new BadRequestException("Tipo de cuenta inválido");
  }

  private async accountsInTransaction(tx: Transaction, type: string) {
    if (type === "cobrar") {
      const rows = await tx.cuentaCobrar.findMany({ include: {
        cliente: true, venta: true,
        pagos: { orderBy: { fechaPago: "desc" }, include: { metodoPago: true, trabajador: true } },
      }});
      return rows.map((row) => this.receivableView(row));
    }
    const rows = await tx.cuentaPagar.findMany({ include: {
      compra: { include: { proveedor: true } },
      pagos: { orderBy: { fechaPago: "desc" }, include: { metodoPago: true, trabajador: true } },
    }});
    return rows.map((row) => this.payableView(row));
  }

  private paymentView(row: any) {
    return {
      id: row.id.toString(), fecha: row.fechaPago, monto: Number(row.monto), metodo: row.metodoPago.nombre,
      numeroOperacion: row.numeroOperacion, observaciones: row.observaciones, estado: row.estado,
      trabajador: `${row.trabajador.nombres} ${row.trabajador.apellidos}`.trim(),
    };
  }

  private accountState(row: any) {
    if (Number(row.saldoPendiente) <= 0) return "PAGADA";
    if (row.fechaVencimiento && new Date(row.fechaVencimiento).getTime() < new Date().setHours(0, 0, 0, 0)) return "VENCIDA";
    return Number(row.montoPagado) > 0 ? "PARCIAL" : "PENDIENTE";
  }

  private receivableView(row: any) {
    return {
      id: row.id.toString(), tipo: "cobrar", tercero: row.cliente.nombreLegal,
      documento: row.cliente.numeroDocumento, comprobante: `${row.venta.serie}-${row.venta.numero}`,
      emision: row.fechaEmision, vencimiento: row.fechaVencimiento,
      original: Number(row.montoOriginal), pagado: Number(row.montoPagado), saldo: Number(row.saldoPendiente),
      estado: this.accountState(row), pagos: row.pagos.map((payment: any) => this.paymentView(payment)),
    };
  }

  private payableView(row: any) {
    return {
      id: row.id.toString(), tipo: "pagar", tercero: row.compra.proveedor.razonSocial,
      documento: row.compra.proveedor.ruc, comprobante: `${row.compra.serie}-${row.compra.numero}`,
      emision: row.fechaEmision, vencimiento: row.fechaVencimiento,
      original: Number(row.montoOriginal), pagado: Number(row.montoPagado), saldo: Number(row.saldoPendiente),
      estado: this.accountState(row), pagos: row.pagos.map((payment: any) => this.paymentView(payment)),
    };
  }

  private stockRow(tx: Transaction, productoId: bigint, almacenId: bigint, loteId: bigint | null, estadoInventarioId: bigint) {
    return tx.stockAlmacen.findFirst({ where: { productoId, almacenId, loteId, estadoInventarioId } });
  }

  private saleableStockRows(tx: Transaction, productoId: bigint, almacenId: bigint, loteId: bigint | null) {
    return tx.stockAlmacen.findMany({
      where: {
        productoId,
        almacenId,
        // When the sale does not specify a lot, consume the available lots in order.
        // This is necessary because the sales form does not require selecting one.
        loteId: loteId ?? undefined,
        cantidad: { gt: 0 },
        estadoInventario: { estado: true, permiteVenta: true },
      },
      orderBy: { id: "asc" },
    });
  }

  private findPurchase(tx: Transaction, id: bigint) {
    return tx.compra.findUnique({ where: { id }, include: {
      proveedor: true, almacenDestino: true, detalles: { include: { producto: true, detallesDevolucion: { where: { devolucionCompra: { estado: "CONFIRMADA" } } } } }, cuentaPagar: true, devoluciones: true, movimientosInventario: true,
    }}).then((row) => row ?? Promise.reject(new NotFoundException("Compra no encontrada")));
  }

  private findSale(tx: Transaction, id: bigint) {
    return tx.venta.findUnique({ where: { id }, include: {
      cliente: true, almacenOrigen: true, detalles: { include: { producto: true, detallesDevolucion: { where: { devolucionVenta: { estado: "CONFIRMADA" } } } } }, cuentaCobrar: true, devoluciones: true, movimientosInventario: true,
    }}).then((row) => row ?? Promise.reject(new NotFoundException("Venta no encontrada")));
  }

  private lineTotal(item: { cantidad: number; precioUnitario: number; descuento?: number }) {
    return Math.max(item.cantidad * item.precioUnitario - (item.descuento ?? 0), 0);
  }

  private totals(items: { cantidad: number; precioUnitario: number; descuento?: number }[], discount = 0, includeIgv = true) {
    const subtotal = items.reduce((sum, item) => sum + this.lineTotal(item), 0);
    const descuento = discount ?? 0;
    const taxable = Math.max(subtotal - descuento, 0);
    const igv = includeIgv ? taxable * 0.18 : 0;
    return { subtotal, descuento, igv, total: taxable + igv };
  }

  private purchaseView(row: any) {
    const returned = row.devoluciones?.filter((item: any) => item.estado === "CONFIRMADA").reduce((sum: number, item: any) => sum + Number(item.total), 0) ?? 0;
    return {
      id: row.id.toString(), codigo: `C-${row.id.toString().padStart(6, "0")}`, tipoComprobante: row.tipoComprobante, serie: row.serie, numero: row.numero, comprobante: `${row.tipoComprobante} ${row.serie}-${row.numero}`, fecha: row.fecha,
      proveedor: row.proveedor.razonSocial, almacen: row.almacenDestino.nombre, pago: row.tipoPago,
      subtotal: Number(row.subtotal), igv: Number(row.igv), descuento: Number(row.descuento), total: Number(row.total),
      montoInicial: Number(row.montoInicial), fechaVencimiento: row.cuentaPagar?.fechaVencimiento ?? row.fechaVencimientoPago,
      totalNeto: Math.max(Number(row.total) - returned, 0), pagado: Number(row.cuentaPagar?.montoPagado ?? 0), saldo: Number(row.cuentaPagar?.saldoPendiente ?? 0), estado: row.estado, estadoPago: row.estadoPago, estadoDevolucion: row.estadoDevolucion, kardexId: row.movimientosInventario[0]?.id?.toString() ?? null,
      items: row.detalles.map((item: any) => ({ id: item.id.toString(), producto: item.producto.nombre, cantidad: Number(item.cantidad), cantidadDevuelta: item.detallesDevolucion?.reduce((sum: number, detail: any) => sum + Number(detail.cantidad), 0) ?? 0, precio: Number(item.costoUnitario), subtotal: Number(item.subtotal) })),
    };
  }

  private saleView(row: any) {
    const returned = row.devoluciones?.filter((item: any) => item.estado === "CONFIRMADA").reduce((sum: number, item: any) => sum + Number(item.total), 0) ?? 0;
    return {
      id: row.id.toString(), codigo: `V-${row.id.toString().padStart(6, "0")}`, tipoComprobante: row.tipoComprobante, serie: row.serie, numero: row.numero, comprobante: `${row.tipoComprobante} ${row.serie}-${row.numero}`, fecha: row.fecha,
      cliente: row.cliente.nombreLegal, almacen: row.almacenOrigen.nombre, pago: row.tipoPago,
      subtotal: Number(row.subtotal), igv: Number(row.igv), descuento: Number(row.descuento), total: Number(row.total),
      montoInicial: Number(row.montoInicial), fechaVencimiento: row.cuentaCobrar?.fechaVencimiento ?? row.fechaVencimientoPago,
      totalNeto: Math.max(Number(row.total) - returned, 0), pagado: Number(row.cuentaCobrar?.montoPagado ?? 0), saldo: Number(row.cuentaCobrar?.saldoPendiente ?? 0), estado: row.estado, estadoPago: row.estadoPago, estadoDevolucion: row.estadoDevolucion,
      kardexId: row.movimientosInventario[0]?.id?.toString() ?? null,
      items: row.detalles.map((item: any) => ({ id: item.id.toString(), producto: item.producto.nombre, cantidad: Number(item.cantidad), cantidadDevuelta: item.detallesDevolucion?.reduce((sum: number, detail: any) => sum + Number(detail.cantidad), 0) ?? 0, precio: Number(item.precioUnitario), subtotal: Number(item.subtotal) })),
    };
  }
}
