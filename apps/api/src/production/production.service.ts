import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductionOrderDto, UpdateProductionOrderDto } from './production.dto';

type Transaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// Un consumo listo para descontar del almacén: cuánto y de qué producto.
type ConsumoParaDescontar = {
  id: bigint;
  productoId: bigint;
  cantidadPlanificada: Prisma.Decimal | number;
  producto: { nombre: string };
};

@Injectable()
export class ProductionService {
  constructor(private readonly prisma: PrismaService) {}

  async catalogs() {
    const [productos, almacenes] = await Promise.all([
      this.prisma.producto.findMany({
        where: { estado: true },
        include: { tipoProducto: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.almacen.findMany({ where: { estado: true }, orderBy: { nombre: 'asc' } }),
    ]);
    const productView = productos.map((item) => ({
      id: item.id.toString(),
      codigo: item.codigo,
      nombre: item.nombre,
      tipo: item.tipoProducto.nombre,
      unidad: item.unidadMedida,
      controlaLote: item.controlaLote,
      retornable: item.esRetornable,
    }));
    return {
      productosTerminados: productView.filter((item) => item.tipo.toLowerCase() !== 'insumo'),
      insumos: productView.filter((item) => item.tipo.toLowerCase() === 'insumo'),
      almacenes: almacenes.map((item) => ({
        id: item.id.toString(),
        codigo: item.codigo,
        nombre: item.nombre,
        tipo: item.tipo,
      })),
    };
  }

  async orders() {
    const rows = await this.prisma.ordenProduccion.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: this.include(),
    });
    return rows.map((row) => this.view(row));
  }

  async create(dto: CreateProductionOrderDto) {
    // Registrar producción es un solo paso: la orden nace ya completada (crea el lote,
    // consume insumos y actualiza el stock) en la misma transacción, sin un estado
    // intermedio "BORRADOR" que requiera una confirmación aparte.
    return this.prisma.$transaction(
      async (tx) => {
        const inputs = dto.insumos ?? [];
        const destination =
          (dto.almacenProductoTerminadoId
            ? await tx.almacen.findUnique({
                where: { id: BigInt(dto.almacenProductoTerminadoId) },
              })
            : null) ??
          (await tx.almacen.findFirst({ where: { estado: true }, orderBy: { id: 'asc' } }));
        if (!destination)
          throw new BadRequestException('Registre un almacén antes de crear producción');
        const source =
          (await tx.almacen.findFirst({
            where: { estado: true, id: { not: destination.id } },
            orderBy: { id: 'asc' },
          })) ?? destination;
        const repeated = new Set(inputs.map((item) => item.productoId));
        if (repeated.size !== inputs.length)
          throw new BadRequestException('Cada insumo debe aparecer una sola vez');
        const worker = await this.ensureWorker(tx);
        const cantidadProducida = dto.cantidadPlanificada;
        const order = await tx.ordenProduccion.create({
          data: {
            codigo: await this.nextOrderCode(tx),
            productoId: BigInt(dto.productoId),
            almacenInsumosId: source.id,
            almacenProductoTerminadoId: destination.id,
            trabajadorId: worker.id,
            cantidadPlanificada: dto.cantidadPlanificada,
            fechaPlanificada: new Date(dto.fechaPlanificada),
            fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
            consumos: inputs.length
              ? {
                  create: inputs.map((item) => ({
                    productoId: BigInt(item.productoId),
                    cantidadPlanificada: item.cantidad,
                  })),
                }
              : undefined,
          },
          include: this.include(),
        });

        const available = await this.ensureAvailableState(tx);
        const movement = await tx.movimientoInventario.create({
          data: {
            tipoMovimiento: 'PRODUCCION',
            tipoOperacion: 'PRODUCCION',
            almacenOrigenId: order.almacenInsumosId,
            almacenDestinoId: order.almacenProductoTerminadoId,
            ordenProduccionId: order.id,
            trabajadorId: order.trabajadorId,
            estado: 'CONFIRMADO',
            numeroReferencia: order.codigo,
            observaciones: `Transformación de insumos en ${order.producto.nombre}`,
          },
        });

        const totalCost = await this.consumeInputs(
          tx,
          movement.id,
          order.almacenInsumosId,
          order.consumos,
        );

        const unitCost = totalCost / cantidadProducida;
        const lotCode = order.codigoLote || `LOT-${order.id.toString().padStart(6, '0')}`;
        const lot = await tx.lote.create({
          data: {
            productoId: order.productoId,
            codigoLote: lotCode,
            fechaProduccion: new Date(),
            fechaVencimiento: order.fechaVencimiento,
            costoUnitario: unitCost,
            estado: 'ACTIVO',
          },
        });
        await this.produceOutput(tx, {
          movementId: movement.id,
          productoId: order.productoId,
          almacenId: order.almacenProductoTerminadoId,
          loteId: lot.id,
          estadoInventarioId: available.id,
          cantidadProducida,
          unitCost,
          totalCost,
        });
        await tx.ordenProduccion.update({
          where: { id: order.id },
          data: {
            estado: 'COMPLETADA',
            cantidadProducida,
            costoTotal: totalCost,
            loteId: lot.id,
            fechaInicio: new Date(),
            fechaFin: new Date(),
          },
        });
        const completed = await tx.ordenProduccion.findUniqueOrThrow({
          where: { id: order.id },
          include: this.include(),
        });
        return this.view(completed);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Edita una producción ya completada. Como la producción nace completada (no hay un estado
   * intermedio), editar significa revertir su efecto físico —devolver los insumos al almacén y
   * retirar el producto terminado— y volver a aplicarlo con los datos nuevos, sin borrar el
   * kardex histórico (es un ledger de solo-append).
   *
   * No se puede editar si el lote producido ya se movió: ventas, devoluciones, transferencias
   * o cualquier otro movimiento de inventario sobre ese lote. En ese caso corregirlo aquí
   * dejaría el stock descuadrado.
   */
  async update(id: string, dto: UpdateProductionOrderDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const orderId = BigInt(id);
        const order = await tx.ordenProduccion.findUnique({
          where: { id: orderId },
          include: {
            producto: true,
            lote: { include: { detallesVenta: true, detallesDevolucionVenta: true } },
            movimientosInventario: { include: { detalles: true }, orderBy: { id: 'asc' } },
          },
        });
        if (!order) throw new NotFoundException('Producción no encontrada');
        if (order.estado !== 'COMPLETADA')
          throw new BadRequestException('Solo se puede editar una producción completada');

        const nuevosInsumos = dto.insumos ?? [];
        const repetidos = new Set(nuevosInsumos.map((item) => item.productoId));
        if (repetidos.size !== nuevosInsumos.length)
          throw new BadRequestException('Cada insumo debe aparecer una sola vez');

        await this.assertLoteEditable(tx, order);

        // 1. Revertir el efecto de la producción actual.
        await this.reverseProduction(tx, order);

        // 2. Rehacer con los datos nuevos.
        const destino = dto.almacenProductoTerminadoId
          ? await tx.almacen.findUnique({ where: { id: BigInt(dto.almacenProductoTerminadoId) } })
          : await tx.almacen.findUnique({ where: { id: order.almacenProductoTerminadoId } });
        if (!destino || !destino.estado)
          throw new BadRequestException('El almacén destino no está disponible');

        await tx.consumoOrdenProduccion.deleteMany({ where: { ordenProduccionId: order.id } });
        if (nuevosInsumos.length)
          await tx.consumoOrdenProduccion.createMany({
            data: nuevosInsumos.map((item) => ({
              ordenProduccionId: order.id,
              productoId: BigInt(item.productoId),
              cantidadPlanificada: item.cantidad,
            })),
          });
        const consumos = await tx.consumoOrdenProduccion.findMany({
          where: { ordenProduccionId: order.id },
          include: { producto: true },
        });

        const available = await this.ensureAvailableState(tx);
        const reapply = await tx.movimientoInventario.create({
          data: {
            tipoMovimiento: 'PRODUCCION',
            tipoOperacion: 'PRODUCCION',
            almacenOrigenId: order.almacenInsumosId,
            almacenDestinoId: destino.id,
            ordenProduccionId: order.id,
            trabajadorId: order.trabajadorId,
            estado: 'CONFIRMADO',
            numeroReferencia: `${order.codigo}-R`,
            observaciones: `Edición de producción de ${order.producto.nombre}`,
          },
        });

        const cantidadProducida = dto.cantidadPlanificada;
        const totalCost = await this.consumeInputs(
          tx,
          reapply.id,
          order.almacenInsumosId,
          consumos,
        );
        const unitCost = totalCost / cantidadProducida;
        const vencimiento = dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null;

        // El lote ya existe: se reutiliza (mismo código) y solo se recalculan costo y
        // vencimiento con los datos nuevos.
        const lotCode =
          order.lote?.codigoLote ??
          order.codigoLote ??
          `LOT-${order.id.toString().padStart(6, '0')}`;
        const lot = order.loteId
          ? await tx.lote.update({
              where: { id: order.loteId },
              data: { costoUnitario: unitCost, fechaVencimiento: vencimiento },
            })
          : await tx.lote.create({
              data: {
                productoId: order.productoId,
                codigoLote: lotCode,
                fechaProduccion: new Date(),
                fechaVencimiento: vencimiento,
                costoUnitario: unitCost,
                estado: 'ACTIVO',
              },
            });

        await this.produceOutput(tx, {
          movementId: reapply.id,
          productoId: order.productoId,
          almacenId: destino.id,
          loteId: lot.id,
          estadoInventarioId: available.id,
          cantidadProducida,
          unitCost,
          totalCost,
        });

        await tx.ordenProduccion.update({
          where: { id: order.id },
          data: {
            almacenProductoTerminadoId: destino.id,
            cantidadPlanificada: dto.cantidadPlanificada,
            cantidadProducida,
            costoTotal: totalCost,
            fechaPlanificada: new Date(dto.fechaPlanificada),
            fechaVencimiento: vencimiento,
            loteId: lot.id,
            fechaFin: new Date(),
          },
        });

        const updated = await tx.ordenProduccion.findUniqueOrThrow({
          where: { id: order.id },
          include: this.include(),
        });
        return this.view(updated);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Corta la edición si el lote producido ya tuvo salidas: ventas, devoluciones o cualquier
   * movimiento de inventario que no sea de la propia orden.
   */
  private async assertLoteEditable(
    tx: Transaction,
    order: {
      id: bigint;
      loteId: bigint | null;
      lote: { detallesVenta: unknown[]; detallesDevolucionVenta: unknown[] } | null;
      movimientosInventario: { id: bigint }[];
    },
  ) {
    if (!order.loteId || !order.lote) return;
    if (order.lote.detallesVenta.length > 0 || order.lote.detallesDevolucionVenta.length > 0)
      throw new BadRequestException(
        'No se puede editar: el lote de esta producción ya tiene ventas o devoluciones',
      );
    const movimientosPropios = order.movimientosInventario.map((movimiento) => movimiento.id);
    const movimientosExternos = await tx.detalleMovimientoInventario.count({
      where: { loteId: order.loteId, movimientoId: { notIn: movimientosPropios } },
    });
    if (movimientosExternos > 0)
      throw new BadRequestException(
        'No se puede editar: el lote ya tuvo otros movimientos de inventario',
      );
  }

  /**
   * Revierte el último movimiento de producción de la orden: cada SALIDA de insumo vuelve como
   * ENTRADA al almacén y la ENTRADA de producto terminado sale de nuevo. Deja el stock como
   * estaba antes de producir.
   */
  private async reverseProduction(
    tx: Transaction,
    order: {
      id: bigint;
      codigo: string;
      trabajadorId: bigint;
      almacenInsumosId: bigint;
      almacenProductoTerminadoId: bigint;
      movimientosInventario: {
        id: bigint;
        tipoMovimiento: string;
        detalles: {
          productoId: bigint;
          almacenId: bigint;
          loteId: bigint | null;
          estadoInventarioId: bigint;
          direccion: string;
          cantidad: Prisma.Decimal;
          costoUnitario: Prisma.Decimal;
          costoTotal: Prisma.Decimal;
        }[];
      }[];
    },
  ) {
    const activo = [...order.movimientosInventario]
      .reverse()
      .find((movimiento) => movimiento.tipoMovimiento === 'PRODUCCION');
    if (!activo)
      throw new BadRequestException(
        'La producción no tiene un movimiento de inventario que revertir',
      );

    const reversa = await tx.movimientoInventario.create({
      data: {
        tipoMovimiento: 'AJUSTE',
        tipoOperacion: 'PRODUCCION',
        almacenOrigenId: order.almacenProductoTerminadoId,
        almacenDestinoId: order.almacenInsumosId,
        ordenProduccionId: order.id,
        trabajadorId: order.trabajadorId,
        estado: 'CONFIRMADO',
        numeroReferencia: `${order.codigo}-REV`,
        observaciones: 'Reversión de producción para edición',
      },
    });

    for (const linea of activo.detalles) {
      const direccionReversa = linea.direccion === 'SALIDA' ? 'ENTRADA' : 'SALIDA';
      const stock = await tx.stockAlmacen.findFirst({
        where: {
          productoId: linea.productoId,
          almacenId: linea.almacenId,
          loteId: linea.loteId,
          estadoInventarioId: linea.estadoInventarioId,
        },
      });
      const previous = Number(stock?.cantidad ?? 0);
      const delta =
        direccionReversa === 'ENTRADA' ? Number(linea.cantidad) : -Number(linea.cantidad);
      const next = previous + delta;
      if (next < -0.0005)
        throw new BadRequestException(
          'No se puede revertir la producción: el stock del lote ya cambió',
        );
      if (stock)
        await tx.stockAlmacen.update({ where: { id: stock.id }, data: { cantidad: next } });
      else
        await tx.stockAlmacen.create({
          data: {
            productoId: linea.productoId,
            almacenId: linea.almacenId,
            loteId: linea.loteId,
            estadoInventarioId: linea.estadoInventarioId,
            cantidad: next,
            costoPromedio: linea.costoUnitario,
          },
        });
      await tx.detalleMovimientoInventario.create({
        data: {
          movimientoId: reversa.id,
          productoId: linea.productoId,
          almacenId: linea.almacenId,
          loteId: linea.loteId,
          estadoInventarioId: linea.estadoInventarioId,
          direccion: direccionReversa,
          cantidad: linea.cantidad,
          costoUnitario: linea.costoUnitario,
          costoTotal: linea.costoTotal,
          saldoAnterior: previous,
          saldoPosterior: next,
        },
      });
    }
  }

  /**
   * Descuenta los insumos del almacén de origen con criterio FIFO (el stock más antiguo
   * primero) y registra cada salida en el kardex. Devuelve el costo total consumido.
   */
  private async consumeInputs(
    tx: Transaction,
    movementId: bigint,
    almacenInsumosId: bigint,
    consumos: ConsumoParaDescontar[],
  ): Promise<number> {
    let totalCost = 0;
    for (const input of consumos) {
      let remaining = Number(input.cantidadPlanificada);
      const stockRows = await tx.stockAlmacen.findMany({
        where: {
          productoId: input.productoId,
          almacenId: almacenInsumosId,
          estadoInventario: { codigo: { in: ['DISPONIBLE', 'VACIO'] } },
        },
        orderBy: { updatedAt: 'asc' },
        include: { producto: true },
      });
      const free = stockRows.reduce(
        (sum, stock) => sum + Number(stock.cantidad) - Number(stock.cantidadReservada),
        0,
      );
      if (free < remaining)
        throw new BadRequestException(
          `Stock insuficiente de ${input.producto.nombre}. Disponible: ${free}`,
        );
      let inputCost = 0;
      for (const stock of stockRows) {
        if (remaining <= 0) break;
        const previous = Number(stock.cantidad);
        const take = Math.min(previous - Number(stock.cantidadReservada), remaining);
        if (take <= 0) continue;
        const next = previous - take;
        const cost = take * Number(stock.costoPromedio);
        await tx.stockAlmacen.update({ where: { id: stock.id }, data: { cantidad: next } });
        await tx.detalleMovimientoInventario.create({
          data: {
            movimientoId: movementId,
            productoId: stock.productoId,
            almacenId: stock.almacenId,
            loteId: stock.loteId,
            estadoInventarioId: stock.estadoInventarioId,
            direccion: 'SALIDA',
            cantidad: take,
            costoUnitario: stock.costoPromedio,
            costoTotal: cost,
            saldoAnterior: previous,
            saldoPosterior: next,
          },
        });
        remaining -= take;
        inputCost += cost;
        totalCost += cost;
      }
      await tx.consumoOrdenProduccion.update({
        where: { id: input.id },
        data: {
          cantidadConsumida: input.cantidadPlanificada,
          costoUnitario: inputCost / Number(input.cantidadPlanificada),
        },
      });
    }
    return totalCost;
  }

  /** Ingresa el producto terminado al almacén destino y lo registra en el kardex. */
  private async produceOutput(
    tx: Transaction,
    params: {
      movementId: bigint;
      productoId: bigint;
      almacenId: bigint;
      loteId: bigint;
      estadoInventarioId: bigint;
      cantidadProducida: number;
      unitCost: number;
      totalCost: number;
    },
  ) {
    const { movementId, productoId, almacenId, loteId, estadoInventarioId } = params;
    const { cantidadProducida, unitCost, totalCost } = params;
    const outputStock = await tx.stockAlmacen.findFirst({
      where: { productoId, almacenId, loteId, estadoInventarioId },
    });
    const previousOutput = Number(outputStock?.cantidad ?? 0);
    const nextOutput = previousOutput + cantidadProducida;
    const previousCost = Number(outputStock?.costoPromedio ?? 0);
    // Cada producción crea un lote nuevo, así que `previousOutput` normalmente es 0; se
    // promedia igual por si el código de lote se reutiliza, para no pisar el costo.
    const costoPromedio =
      nextOutput > 0
        ? (previousOutput * previousCost + cantidadProducida * unitCost) / nextOutput
        : unitCost;
    if (outputStock)
      await tx.stockAlmacen.update({
        where: { id: outputStock.id },
        data: { cantidad: nextOutput, costoPromedio },
      });
    else
      await tx.stockAlmacen.create({
        data: {
          productoId,
          almacenId,
          loteId,
          estadoInventarioId,
          cantidad: cantidadProducida,
          costoPromedio: unitCost,
        },
      });
    await tx.detalleMovimientoInventario.create({
      data: {
        movimientoId: movementId,
        productoId,
        almacenId,
        loteId,
        estadoInventarioId,
        direccion: 'ENTRADA',
        cantidad: cantidadProducida,
        costoUnitario: unitCost,
        costoTotal: totalCost,
        saldoAnterior: previousOutput,
        saldoPosterior: nextOutput,
      },
    });
  }

  /**
   * Algunas instalaciones antiguas no tienen cargado el catálogo inicial. La producción
   * siempre genera producto terminado disponible, así que aseguramos el estado antes de
   * registrar el movimiento.
   */
  private ensureAvailableState(tx: Transaction) {
    return tx.estadoInventario.upsert({
      where: { codigo: 'DISPONIBLE' },
      update: { estado: true, permiteVenta: true },
      create: { codigo: 'DISPONIBLE', nombre: 'Disponible', permiteVenta: true },
    });
  }

  private async ensureWorker(tx: Transaction) {
    const worker = await tx.trabajador.findFirst({
      where: { estado: true },
      orderBy: { id: 'asc' },
    });
    if (worker) return worker;
    return tx.trabajador.upsert({
      where: { numeroDocumento: 'SISTEMA' },
      update: { estado: true },
      create: {
        tipoDocumento: 'SISTEMA',
        numeroDocumento: 'SISTEMA',
        nombres: 'Operador',
        apellidos: 'Sistema',
        cargo: 'Operación automática',
      },
    });
  }

  private include() {
    return {
      producto: true,
      almacenInsumos: true,
      almacenProductoTerminado: true,
      trabajador: true,
      lote: true,
      consumos: { include: { producto: true } },
      movimientosInventario: { orderBy: { id: 'asc' } },
    } as const;
  }

  /**
   * Código de la orden del día: "OP-20260904-001", "OP-20260904-002"...
   *
   * Busca el último código de hoy con UNA consulta y le suma 1. Antes probaba uno por uno
   * (hasta 999 consultas seguidas) y encima dentro de una transacción que bloquea la tabla.
   */
  private async nextOrderCode(tx: Transaction) {
    const fecha = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .replaceAll('-', '');
    const prefijoDelDia = `OP-${fecha}-`;
    const ultima = await tx.ordenProduccion.findFirst({
      where: { codigo: { startsWith: prefijoDelDia } },
      orderBy: { codigo: 'desc' },
      select: { codigo: true },
    });
    const ultimoNumero = ultima ? Number(ultima.codigo.slice(prefijoDelDia.length)) : 0;
    const siguiente = (Number.isFinite(ultimoNumero) ? ultimoNumero : 0) + 1;
    if (siguiente > 999)
      throw new BadRequestException('No se pudo generar el código de producción del día');
    return `${prefijoDelDia}${String(siguiente).padStart(3, '0')}`;
  }

  private view(row: any) {
    // Tras una edición hay varios movimientos (original, reversa y re-aplicación); el vigente
    // es el último de tipo PRODUCCION.
    const movimientoVigente =
      [...row.movimientosInventario]
        .reverse()
        .find((m: any) => m.tipoMovimiento === 'PRODUCCION') ?? row.movimientosInventario[0];
    return {
      id: row.id.toString(),
      codigo: row.codigo,
      producto: row.producto.nombre,
      productoId: row.productoId.toString(),
      almacenInsumos: row.almacenInsumos.nombre,
      almacenProductoTerminado: row.almacenProductoTerminado.nombre,
      almacenProductoTerminadoId: row.almacenProductoTerminadoId.toString(),
      cantidadPlanificada: Number(row.cantidadPlanificada),
      cantidadProducida: Number(row.cantidadProducida),
      costoTotal: Number(row.costoTotal),
      fechaPlanificada: row.fechaPlanificada,
      fechaVencimiento: row.fechaVencimiento,
      fechaFin: row.fechaFin,
      estado: row.estado,
      lote: row.lote?.codigoLote ?? row.codigoLote,
      responsable: `${row.trabajador.nombres} ${row.trabajador.apellidos}`,
      kardexId: movimientoVigente?.id?.toString() ?? null,
      kardexRef: row.codigo,
      insumos: row.consumos.map((item: any) => ({
        producto: item.producto.nombre,
        productoId: item.productoId.toString(),
        planificada: Number(item.cantidadPlanificada),
        consumida: Number(item.cantidadConsumida),
      })),
    };
  }
}
