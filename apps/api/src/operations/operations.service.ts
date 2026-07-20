import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOperationalSaleDto, CreatePurchaseDto } from "./operations.dto";

type Transaction = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async catalogs() {
    const [proveedores, clientes, almacenes, productos, trabajador] = await Promise.all([
      this.prisma.proveedor.findMany({ where: { estado: true }, orderBy: { razonSocial: "asc" } }),
      this.prisma.cliente.findMany({ where: { estado: true }, orderBy: { nombreLegal: "asc" } }),
      this.prisma.almacen.findMany({ where: { estado: true }, orderBy: { nombre: "asc" } }),
      this.prisma.producto.findMany({
        where: { estado: true },
        orderBy: { nombre: "asc" },
        include: { lotes: { where: { estado: "ACTIVO" }, orderBy: { fechaVencimiento: "asc" } } },
      }),
      this.prisma.trabajador.findFirst({ where: { estado: true }, orderBy: { id: "asc" } }),
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
      preparado: Boolean(trabajador && almacenes.length && productos.length),
    };
  }

  async purchases() {
    const rows = await this.prisma.compra.findMany({
      orderBy: { fecha: "desc" },
      take: 100,
      include: { proveedor: true, almacenDestino: true, detalles: { include: { producto: true } }, movimientosInventario: true },
    });
    return rows.map((row) => this.purchaseView(row));
  }

  async sales() {
    const rows = await this.prisma.venta.findMany({
      orderBy: { fecha: "desc" },
      take: 100,
      include: { cliente: true, almacenOrigen: true, detalles: { include: { producto: true } }, cuentaCobrar: true, movimientosInventario: true },
    });
    return rows.map((row) => this.saleView(row));
  }

  async stock(almacenId?: string) {
    const rows = await this.prisma.stockAlmacen.findMany({
      where: almacenId ? { almacenId: BigInt(almacenId) } : undefined,
      orderBy: [{ almacen: { nombre: "asc" } }, { producto: { nombre: "asc" } }],
      include: { producto: true, almacen: true, lote: true, estadoInventario: true },
    });
    return rows.map((row) => ({
      id: row.id.toString(),
      producto: row.producto.nombre,
      codigo: row.producto.codigo,
      almacen: row.almacen.nombre,
      lote: row.lote?.codigoLote ?? "Sin lote",
      estado: row.estadoInventario.codigo,
      cantidad: Number(row.cantidad),
      reservada: Number(row.cantidadReservada),
      minimo: Number(row.stockMinimo),
      costo: Number(row.costoPromedio),
    }));
  }

  async movements() {
    const rows = await this.prisma.movimientoInventario.findMany({
      orderBy: { fecha: "desc" },
      take: 200,
      include: { almacenOrigen: true, almacenDestino: true, detalles: { include: { producto: true } } },
    });
    return rows.map((row) => ({
      id: row.id.toString(),
      referencia: row.numeroReferencia ?? `MOV-${row.id.toString().padStart(6, "0")}`,
      fecha: row.fecha,
      tipo: row.tipoMovimiento,
      operacion: row.tipoOperacion,
      origen: row.almacenOrigen?.nombre ?? "-",
      destino: row.almacenDestino?.nombre ?? "-",
      estado: row.estado,
      unidades: row.detalles.reduce((sum, item) => sum + Number(item.cantidad), 0),
      detalles: row.detalles.map((item) => ({
        producto: item.producto.nombre,
        direccion: item.direccion,
        cantidad: Number(item.cantidad),
        saldoAnterior: Number(item.saldoAnterior),
        saldoPosterior: Number(item.saldoPosterior),
      })),
    }));
  }

  async createPurchase(dto: CreatePurchaseDto, confirm = false) {
    return this.prisma.$transaction(async (tx) => {
      const trabajadorId = await this.workerId(tx);
      const totals = this.totals(dto.items, dto.descuento);
      const purchase = await tx.compra.create({
        data: {
          proveedorId: BigInt(dto.proveedorId), almacenDestinoId: BigInt(dto.almacenId), trabajadorId,
          tipoComprobante: dto.tipoComprobante, serie: dto.serie.trim().toUpperCase(), numero: dto.numero.trim(),
          tipoPago: dto.tipoPago, estado: "BORRADOR", observaciones: dto.observaciones,
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
      const totals = this.totals(dto.items, dto.descuento);
      const sale = await tx.venta.create({
        data: {
          clienteId: BigInt(dto.clienteId), almacenOrigenId: BigInt(dto.almacenId), trabajadorId,
          tipoComprobante: dto.tipoComprobante, serie: dto.serie.trim().toUpperCase(), numero: dto.numero.trim(),
          tipoPago: dto.tipoPago, estado: "BORRADOR", observaciones: dto.observaciones,
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
    if (purchase.tipoPago !== "CONTADO") await tx.cuentaPagar.create({ data: {
      compraId: purchase.id, montoOriginal: purchase.total, saldoPendiente: purchase.total,
      fechaEmision: new Date(), estado: "PENDIENTE",
    }});
    await tx.compra.update({ where: { id }, data: { estado: "CONFIRMADA" } });
  }

  private async confirmSaleTx(tx: Transaction, id: bigint) {
    const sale = await this.findSale(tx, id);
    if (sale.estado !== "BORRADOR") throw new BadRequestException("La venta ya fue procesada");
    const available = await this.availableState(tx);
    const movement = await tx.movimientoInventario.create({ data: {
      tipoMovimiento: "SALIDA", tipoOperacion: "VENTA", almacenOrigenId: sale.almacenOrigenId,
      ventaId: sale.id, trabajadorId: sale.trabajadorId, estado: "CONFIRMADO",
      numeroReferencia: `VEN-${sale.id.toString().padStart(6, "0")}`,
      observaciones: `Salida automatica por ${sale.tipoComprobante} ${sale.serie}-${sale.numero}`,
    }});
    for (const item of sale.detalles) {
      const stock = await this.stockRow(tx, item.productoId, sale.almacenOrigenId, item.loteId, available.id);
      const previous = Number(stock?.cantidad ?? 0);
      const free = previous - Number(stock?.cantidadReservada ?? 0);
      if (!stock || free < Number(item.cantidad)) {
        throw new BadRequestException(`Stock insuficiente para ${item.producto.nombre}. Disponible: ${free}`);
      }
      const next = previous - Number(item.cantidad);
      await tx.stockAlmacen.update({ where: { id: stock.id }, data: { cantidad: next } });
      await tx.detalleMovimientoInventario.create({ data: {
        movimientoId: movement.id, productoId: item.productoId, almacenId: sale.almacenOrigenId,
        loteId: item.loteId, estadoInventarioId: available.id, direccion: "SALIDA", cantidad: item.cantidad,
        costoUnitario: stock.costoPromedio, costoTotal: Number(item.cantidad) * Number(stock.costoPromedio),
        saldoAnterior: previous, saldoPosterior: next,
      }});
    }
    if (sale.tipoPago !== "CONTADO") await tx.cuentaCobrar.create({ data: {
      ventaId: sale.id, clienteId: sale.clienteId, montoOriginal: sale.total, saldoPendiente: sale.total,
      fechaEmision: new Date(), estado: "PENDIENTE",
    }});
    await tx.venta.update({ where: { id }, data: { estado: "CONFIRMADA" } });
  }

  private async workerId(tx: Transaction) {
    const worker = await tx.trabajador.findFirst({ where: { estado: true }, orderBy: { id: "asc" } });
    if (!worker) throw new BadRequestException("Registre un trabajador activo antes de operar");
    return worker.id;
  }

  private async availableState(tx: Transaction) {
    const state = await tx.estadoInventario.findUnique({ where: { codigo: "DISPONIBLE" } });
    if (!state) throw new BadRequestException("No existe el estado de inventario DISPONIBLE");
    return state;
  }

  private stockRow(tx: Transaction, productoId: bigint, almacenId: bigint, loteId: bigint | null, estadoInventarioId: bigint) {
    return tx.stockAlmacen.findFirst({ where: { productoId, almacenId, loteId, estadoInventarioId } });
  }

  private findPurchase(tx: Transaction, id: bigint) {
    return tx.compra.findUnique({ where: { id }, include: {
      proveedor: true, almacenDestino: true, detalles: { include: { producto: true } }, movimientosInventario: true,
    }}).then((row) => row ?? Promise.reject(new NotFoundException("Compra no encontrada")));
  }

  private findSale(tx: Transaction, id: bigint) {
    return tx.venta.findUnique({ where: { id }, include: {
      cliente: true, almacenOrigen: true, detalles: { include: { producto: true } }, cuentaCobrar: true, movimientosInventario: true,
    }}).then((row) => row ?? Promise.reject(new NotFoundException("Venta no encontrada")));
  }

  private lineTotal(item: { cantidad: number; precioUnitario: number; descuento?: number }) {
    return Math.max(item.cantidad * item.precioUnitario - (item.descuento ?? 0), 0);
  }

  private totals(items: { cantidad: number; precioUnitario: number; descuento?: number }[], discount = 0) {
    const subtotal = items.reduce((sum, item) => sum + this.lineTotal(item), 0);
    const descuento = discount ?? 0;
    const taxable = Math.max(subtotal - descuento, 0);
    const igv = taxable * 0.18;
    return { subtotal, descuento, igv, total: taxable + igv };
  }

  private purchaseView(row: any) {
    return {
      id: row.id.toString(), comprobante: `${row.serie}-${row.numero}`, fecha: row.fecha,
      proveedor: row.proveedor.razonSocial, almacen: row.almacenDestino.nombre, pago: row.tipoPago,
      subtotal: Number(row.subtotal), igv: Number(row.igv), descuento: Number(row.descuento), total: Number(row.total),
      estado: row.estado, kardexId: row.movimientosInventario[0]?.id?.toString() ?? null,
      items: row.detalles.map((item: any) => ({ producto: item.producto.nombre, cantidad: Number(item.cantidad), precio: Number(item.costoUnitario), subtotal: Number(item.subtotal) })),
    };
  }

  private saleView(row: any) {
    return {
      id: row.id.toString(), comprobante: `${row.serie}-${row.numero}`, fecha: row.fecha,
      cliente: row.cliente.nombreLegal, almacen: row.almacenOrigen.nombre, pago: row.tipoPago,
      subtotal: Number(row.subtotal), igv: Number(row.igv), descuento: Number(row.descuento), total: Number(row.total),
      saldo: Number(row.cuentaCobrar?.saldoPendiente ?? 0), estado: row.estado,
      kardexId: row.movimientosInventario[0]?.id?.toString() ?? null,
      items: row.detalles.map((item: any) => ({ producto: item.producto.nombre, cantidad: Number(item.cantidad), precio: Number(item.precioUnitario), subtotal: Number(item.subtotal) })),
    };
  }
}
