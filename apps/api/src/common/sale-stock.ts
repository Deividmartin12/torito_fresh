import { BadRequestException } from '@nestjs/common';
import { StockAlmacen } from '@prisma/client';
import { Transaction } from './stock';

/** Todas estas funciones participan en la transacción serializable del llamador. */
function stockVendible(tx: Transaction, productoId: bigint, almacenId: bigint, loteId?: bigint) {
  return tx.stockAlmacen.findMany({
    where: {
      productoId,
      almacenId,
      loteId,
      cantidad: { gt: 0 },
      estadoInventario: { estado: true, permiteVenta: true },
    },
    orderBy: [{ lote: { fechaProduccion: 'asc' } }, { id: 'asc' }],
  });
}

async function consumir(
  tx: Transaction,
  movimientoId: bigint,
  stocks: StockAlmacen[],
  cantidad: number,
) {
  let pendiente = cantidad;
  for (const stock of stocks) {
    const anterior = Number(stock.cantidad);
    const tomar = Math.min(Math.max(anterior - Number(stock.cantidadReservada), 0), pendiente);
    if (tomar <= 0) continue;
    const posterior = anterior - tomar;
    await tx.stockAlmacen.update({ where: { id: stock.id }, data: { cantidad: posterior } });
    await tx.detalleMovimientoInventario.create({
      data: {
        movimientoId,
        productoId: stock.productoId,
        almacenId: stock.almacenId,
        loteId: stock.loteId,
        estadoInventarioId: stock.estadoInventarioId,
        direccion: 'SALIDA',
        cantidad: tomar,
        costoUnitario: stock.costoPromedio,
        costoTotal: tomar * Number(stock.costoPromedio),
        saldoAnterior: anterior,
        saldoPosterior: posterior,
      },
    });
    // El arreglo se comparte entre los pendientes de un mismo producto.
    stock.cantidad = stock.cantidad.minus(tomar);
    pendiente -= tomar;
    if (pendiente <= 0) break;
  }
  return pendiente;
}

/** Cubre ventas antiguas con existencias reales, sin modificar cobros ni envases. */
export async function regularizarStockPendiente(
  tx: Transaction,
  productoId: bigint,
  almacenId: bigint,
) {
  const almacen = await tx.almacen.findUniqueOrThrow({
    where: { id: almacenId },
    include: { unidadNegocio: true },
  });
  if (!almacen.unidadNegocio.controlaInventario) return;
  const pendientes = await tx.detalleVenta.findMany({
    where: {
      productoId,
      cantidadPendienteStock: { gt: 0 },
      venta: {
        almacenOrigenId: almacenId,
        unidadNegocioId: almacen.unidadNegocioId,
        estado: 'CONFIRMADA',
      },
    },
    include: { venta: true },
    orderBy: [{ venta: { fecha: 'asc' } }, { ventaId: 'asc' }, { id: 'asc' }],
  });
  if (!pendientes.length) return;
  const stocks = await stockVendible(tx, productoId, almacenId);
  for (const pendiente of pendientes) {
    if (!stocks.some((s) => Number(s.cantidad) > Number(s.cantidadReservada))) break;
    const movimiento = await tx.movimientoInventario.create({
      data: {
        tipoMovimiento: 'SALIDA',
        tipoOperacion: 'VENTA',
        almacenOrigenId: almacenId,
        ventaId: pendiente.ventaId,
        trabajadorId: pendiente.venta.trabajadorId,
        estado: 'CONFIRMADO',
        numeroReferencia: `VEN-${pendiente.ventaId}-REG`,
        observaciones:
          'Regularización de producción pendiente de registrar; conserva la fecha y el cobro de la venta',
      },
    });
    const restante = await consumir(
      tx,
      movimiento.id,
      stocks,
      Number(pendiente.cantidadPendienteStock),
    );
    await tx.detalleVenta.update({
      where: { id: pendiente.id },
      data: { cantidadPendienteStock: restante },
    });
  }
}

export async function descontarVenta(
  tx: Transaction,
  id: bigint,
  opciones: {
    referenceSuffix?: string;
    fecha?: Date;
    loteId?: bigint;
    permitirPendiente?: boolean;
  } = {},
) {
  const venta = await tx.venta.findUniqueOrThrow({
    where: { id },
    include: { detalles: { include: { producto: true } } },
  });
  // Ventas normales respetan la prioridad de las que ya estaban pendientes.
  // La carga diaria sigue usando su lote y sus cantidades estrictas.
  if (opciones.permitirPendiente) {
    for (const productoId of new Set(venta.detalles.map((d) => d.productoId)))
      await regularizarStockPendiente(tx, productoId, venta.almacenOrigenId);
  }
  const movimiento = await tx.movimientoInventario.create({
    data: {
      ...(opciones.fecha ? { fecha: opciones.fecha } : {}),
      tipoMovimiento: 'SALIDA',
      tipoOperacion: 'VENTA',
      almacenOrigenId: venta.almacenOrigenId,
      ventaId: id,
      trabajadorId: venta.trabajadorId,
      estado: 'CONFIRMADO',
      numeroReferencia: `VEN-${id.toString().padStart(6, '0')}${opciones.referenceSuffix ?? ''}`,
      observaciones: opciones.referenceSuffix
        ? 'Salida por edición de venta'
        : 'Salida automática por venta',
    },
  });
  for (const detalle of venta.detalles) {
    const stocks = await stockVendible(
      tx,
      detalle.productoId,
      venta.almacenOrigenId,
      opciones.loteId ?? detalle.loteId ?? undefined,
    );
    const disponible = stocks.reduce(
      (n, s) => n + Math.max(Number(s.cantidad) - Number(s.cantidadReservada), 0),
      0,
    );
    if (!opciones.permitirPendiente && disponible < Number(detalle.cantidad))
      throw new BadRequestException(
        `Stock insuficiente para ${detalle.producto.nombre}. Disponible: ${disponible}`,
      );
    const pendiente = await consumir(tx, movimiento.id, stocks, Number(detalle.cantidad));
    await tx.detalleVenta.update({
      where: { id: detalle.id },
      data: { cantidadPendienteStock: pendiente },
    });
  }
}

/** Revierte el neto vigente de todas las salidas, incluidas regularizaciones y ediciones. */
export async function revertirStockVenta(tx: Transaction, ventaId: bigint, fecha?: Date) {
  const venta = await tx.venta.findUniqueOrThrow({ where: { id: ventaId } });
  const movimientos = await tx.movimientoInventario.findMany({
    where: { ventaId, tipoOperacion: 'VENTA', estado: 'CONFIRMADO' },
    include: { detalles: true },
  });
  if (!movimientos.some((m) => m.tipoMovimiento === 'SALIDA'))
    throw new BadRequestException(
      'Esta venta no tiene movimiento de inventario registrado, así que no se puede editar.',
    );
  const netos = new Map<
    string,
    {
      productoId: bigint;
      almacenId: bigint;
      loteId: bigint | null;
      estadoInventarioId: bigint;
      cantidad: number;
      costo: number;
    }
  >();
  for (const m of movimientos)
    for (const d of m.detalles) {
      const key = `${d.productoId}:${d.almacenId}:${d.loteId}:${d.estadoInventarioId}`;
      const neto = netos.get(key) ?? {
        productoId: d.productoId,
        almacenId: d.almacenId,
        loteId: d.loteId,
        estadoInventarioId: d.estadoInventarioId,
        cantidad: 0,
        costo: 0,
      };
      const signo = d.direccion === 'SALIDA' ? 1 : -1;
      neto.cantidad += signo * Number(d.cantidad);
      neto.costo += signo * Number(d.costoTotal);
      netos.set(key, neto);
    }
  const reversa = await tx.movimientoInventario.create({
    data: {
      ...(fecha ? { fecha } : {}),
      tipoMovimiento: 'ENTRADA',
      tipoOperacion: 'VENTA',
      almacenDestinoId: venta.almacenOrigenId,
      ventaId,
      trabajadorId: venta.trabajadorId,
      estado: 'CONFIRMADO',
      numeroReferencia: `VEN-${ventaId}-REV`,
      observaciones: 'Reversión por edición de venta',
    },
  });
  for (const n of netos.values()) {
    if (n.cantidad <= 0.0005) continue;
    const where = {
      productoId: n.productoId,
      almacenId: n.almacenId,
      loteId: n.loteId,
      estadoInventarioId: n.estadoInventarioId,
    };
    const stock = await tx.stockAlmacen.findFirst({ where });
    const anterior = Number(stock?.cantidad ?? 0);
    const posterior = anterior + n.cantidad;
    const costo = n.costo / n.cantidad;
    if (stock)
      await tx.stockAlmacen.update({
        where: { id: stock.id },
        data: {
          cantidad: posterior,
          costoPromedio: (anterior * Number(stock.costoPromedio) + n.costo) / posterior,
        },
      });
    else
      await tx.stockAlmacen.create({
        data: { ...where, cantidad: posterior, costoPromedio: costo },
      });
    await tx.detalleMovimientoInventario.create({
      data: {
        ...where,
        movimientoId: reversa.id,
        direccion: 'ENTRADA',
        cantidad: n.cantidad,
        costoUnitario: costo,
        costoTotal: n.costo,
        saldoAnterior: anterior,
        saldoPosterior: posterior,
      },
    });
  }
  await tx.detalleVenta.updateMany({ where: { ventaId }, data: { cantidadPendienteStock: 0 } });
}
