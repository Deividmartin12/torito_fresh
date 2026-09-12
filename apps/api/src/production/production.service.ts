import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { exigirTrabajadorId } from '../common/worker-context';
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

  async create(dto: CreateProductionOrderDto, actor: AuthUser) {
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
        const trabajadorId = await exigirTrabajadorId(tx, actor.userId);
        const cantidadProducida = dto.cantidadPlanificada;
        // La producción se fecha con el día elegido en el formulario, no con "ahora": el
        // reporte de resumen agrupa por `fechaFin`, así que inicio, fin y la fecha del lote
        // toman esa misma fecha. Se ancla a medianoche de Lima para que caiga en el día
        // correcto al agrupar por zona horaria.
        const fechaProduccion = this.fechaSeleccionada(dto.fechaPlanificada);
        const order = await tx.ordenProduccion.create({
          data: {
            codigo: await this.nextOrderCode(tx),
            productoId: BigInt(dto.productoId),
            almacenInsumosId: source.id,
            almacenProductoTerminadoId: destination.id,
            trabajadorId,
            cantidadPlanificada: dto.cantidadPlanificada,
            fechaPlanificada: fechaProduccion,
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
            fechaProduccion,
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
            fechaInicio: fechaProduccion,
            fechaFin: fechaProduccion,
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
            consumos: true,
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

        // Si el lote ya se vendió o se movió, no se puede reconstruir el movimiento de
        // inventario sin descuadrar el stock. En ese caso solo se permite corregir las
        // fechas (metadata que no afecta el kardex ni el costo).
        if (await this.loteYaSeMovio(tx, order)) {
          return this.actualizarSoloFechas(tx, order, dto);
        }

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
        // Igual que al crear: inicio, fin y la fecha del lote se ponen en el día elegido
        // en el formulario, para que el reporte de resumen agrupe la producción por esa
        // fecha y no por el momento de la edición.
        const fechaProduccion = this.fechaSeleccionada(dto.fechaPlanificada);
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
              data: { costoUnitario: unitCost, fechaVencimiento: vencimiento, fechaProduccion },
            })
          : await tx.lote.create({
              data: {
                productoId: order.productoId,
                codigoLote: lotCode,
                fechaProduccion,
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
            fechaPlanificada: fechaProduccion,
            fechaVencimiento: vencimiento,
            loteId: lot.id,
            fechaInicio: fechaProduccion,
            fechaFin: fechaProduccion,
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
   * ¿El lote producido ya tuvo salidas? Ventas, devoluciones o cualquier movimiento de
   * inventario que no sea de la propia orden. En ese caso la edición completa (revertir y
   * rehacer) descuadraría el stock, así que solo se permite corregir fechas.
   */
  private async loteYaSeMovio(
    tx: Transaction,
    order: {
      loteId: bigint | null;
      lote: { detallesVenta: unknown[]; detallesDevolucionVenta: unknown[] } | null;
      movimientosInventario: { id: bigint }[];
    },
  ): Promise<boolean> {
    if (!order.loteId || !order.lote) return false;
    if (order.lote.detallesVenta.length > 0 || order.lote.detallesDevolucionVenta.length > 0)
      return true;
    const movimientosPropios = order.movimientosInventario.map((movimiento) => movimiento.id);
    const movimientosExternos = await tx.detalleMovimientoInventario.count({
      where: { loteId: order.loteId, movimientoId: { notIn: movimientosPropios } },
    });
    return movimientosExternos > 0;
  }

  /**
   * Edición en modo seguro: el lote ya se vendió o se movió. Solo se corrigen las fechas de
   * la orden y del lote. No se toca stock, kardex, costo, insumos ni cantidad. Si el usuario
   * intenta cambiar algo que no sea una fecha, se rechaza con un mensaje claro.
   */
  private async actualizarSoloFechas(
    tx: Transaction,
    order: {
      id: bigint;
      loteId: bigint | null;
      almacenProductoTerminadoId: bigint;
      cantidadPlanificada: Prisma.Decimal;
      consumos: { productoId: bigint; cantidadPlanificada: Prisma.Decimal }[];
    },
    dto: UpdateProductionOrderDto,
  ) {
    const MENSAJE =
      'El lote de esta producción ya tiene ventas o movimientos de inventario: solo puedes corregir la fecha de producción y el vencimiento';

    if (Math.abs(Number(dto.cantidadPlanificada) - Number(order.cantidadPlanificada)) > 0.0005)
      throw new BadRequestException(MENSAJE);
    if (
      dto.almacenProductoTerminadoId !== undefined &&
      BigInt(dto.almacenProductoTerminadoId) !== order.almacenProductoTerminadoId
    )
      throw new BadRequestException(MENSAJE);
    if (dto.insumos !== undefined && !this.mismosInsumos(order.consumos, dto.insumos))
      throw new BadRequestException(MENSAJE);

    const fecha = this.fechaSeleccionada(dto.fechaPlanificada);
    const vencimiento = dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null;
    if (vencimiento && vencimiento < fecha)
      throw new BadRequestException(
        'La fecha de vencimiento no puede ser anterior a la de producción',
      );

    if (order.loteId)
      await tx.lote.update({
        where: { id: order.loteId },
        data: { fechaProduccion: fecha, fechaVencimiento: vencimiento },
      });

    await tx.ordenProduccion.update({
      where: { id: order.id },
      data: {
        fechaPlanificada: fecha,
        fechaVencimiento: vencimiento,
        fechaInicio: fecha,
        fechaFin: fecha,
      },
    });

    const updated = await tx.ordenProduccion.findUniqueOrThrow({
      where: { id: order.id },
      include: this.include(),
    });
    return this.view(updated);
  }

  /** Compara el set de insumos guardado contra el del DTO (producto → cantidad). */
  private mismosInsumos(
    guardados: { productoId: bigint; cantidadPlanificada: Prisma.Decimal }[],
    entrantes: { productoId: number; cantidad: number }[],
  ): boolean {
    if (guardados.length !== entrantes.length) return false;
    const previos = new Map(
      guardados.map((item) => [item.productoId.toString(), Number(item.cantidadPlanificada)]),
    );
    return entrantes.every((item) => {
      const previo = previos.get(String(item.productoId));
      return previo !== undefined && Math.abs(previo - Number(item.cantidad)) < 0.0005;
    });
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

  /**
   * Convierte la fecha elegida en el formulario (`YYYY-MM-DD`) en un timestamp anclado a
   * medianoche de Lima (UTC-5, sin horario de verano). Así `fechaInicio`/`fechaFin` caen en
   * ese mismo día cuando el reporte agrupa la producción por zona horaria de Lima.
   */
  private fechaSeleccionada(fecha: string) {
    return new Date(`${fecha.slice(0, 10)}T00:00:00-05:00`);
  }

  private include() {
    return {
      producto: true,
      almacenInsumos: true,
      almacenProductoTerminado: true,
      trabajador: true,
      lote: {
        include: {
          _count: { select: { detallesVenta: true, detallesDevolucionVenta: true } },
        },
      },
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
      // El lote ya se vendió o devolvió: la edición queda limitada a corregir fechas.
      loteMovido:
        (row.lote?._count?.detallesVenta ?? 0) > 0 ||
        (row.lote?._count?.detallesDevolucionVenta ?? 0) > 0,
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
