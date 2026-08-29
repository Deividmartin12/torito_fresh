import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteProductionOrderDto, CreateProductionOrderDto } from './production.dto';

type Transaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

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
    const inputs = dto.insumos ?? [];
    const destination =
      (dto.almacenProductoTerminadoId
        ? await this.prisma.almacen.findUnique({
            where: { id: BigInt(dto.almacenProductoTerminadoId) },
          })
        : null) ??
      (await this.prisma.almacen.findFirst({ where: { estado: true }, orderBy: { id: 'asc' } }));
    if (!destination)
      throw new BadRequestException('Registre un almacén antes de crear producción');
    const source =
      (await this.prisma.almacen.findFirst({
        where: { estado: true, id: { not: destination.id } },
        orderBy: { id: 'asc' },
      })) ?? destination;
    const repeated = new Set(inputs.map((item) => item.productoId));
    if (repeated.size !== inputs.length)
      throw new BadRequestException('Cada insumo debe aparecer una sola vez');
    const worker =
      (await this.prisma.trabajador.findFirst({
        where: { estado: true },
        orderBy: { id: 'asc' },
      })) ??
      (await this.prisma.trabajador.upsert({
        where: { numeroDocumento: 'SISTEMA' },
        update: { estado: true },
        create: {
          tipoDocumento: 'SISTEMA',
          numeroDocumento: 'SISTEMA',
          nombres: 'Operador',
          apellidos: 'Sistema',
          cargo: 'Operación automática',
        },
      }));
    const order = await this.prisma.ordenProduccion.create({
      data: {
        codigo: await this.nextOrderCode(),
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
    return this.view(order);
  }

  async complete(id: string, dto: CompleteProductionOrderDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.ordenProduccion.findUnique({
          where: { id: BigInt(id) },
          include: this.include(),
        });
        if (!order) throw new NotFoundException('Orden de producción no encontrada');
        if (order.estado !== 'BORRADOR') throw new BadRequestException('La orden ya fue procesada');
        if (dto.cantidadProducida + (dto.merma ?? 0) > Number(order.cantidadPlanificada))
          throw new BadRequestException(
            'La producción y la merma no pueden superar la cantidad planificada',
          );

        // Algunas instalaciones antiguas no tienen cargado el catálogo inicial.
        // La producción siempre genera producto terminado disponible, por lo que
        // aseguramos el estado requerido antes de registrar el movimiento.
        const available = await tx.estadoInventario.upsert({
          where: { codigo: 'DISPONIBLE' },
          update: { estado: true, permiteVenta: true },
          create: { codigo: 'DISPONIBLE', nombre: 'Disponible', permiteVenta: true },
        });
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

        let totalCost = 0;
        for (const input of order.consumos) {
          let remaining = Number(input.cantidadPlanificada);
          const stockRows = await tx.stockAlmacen.findMany({
            where: {
              productoId: input.productoId,
              almacenId: order.almacenInsumosId,
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
                movimientoId: movement.id,
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

        const unitCost = totalCost / dto.cantidadProducida;
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
        const outputStock = await tx.stockAlmacen.findFirst({
          where: {
            productoId: order.productoId,
            almacenId: order.almacenProductoTerminadoId,
            loteId: lot.id,
            estadoInventarioId: available.id,
          },
        });
        const previousOutput = Number(outputStock?.cantidad ?? 0);
        const nextOutput = previousOutput + dto.cantidadProducida;
        const previousCost = Number(outputStock?.costoPromedio ?? 0);
        // Cada producción crea un lote nuevo, así que `previousOutput` normalmente es 0; se
        // promedia igual por si el código de lote se reutiliza, para no pisar el costo.
        const costoPromedio =
          nextOutput > 0
            ? (previousOutput * previousCost + dto.cantidadProducida * unitCost) / nextOutput
            : unitCost;
        if (outputStock)
          await tx.stockAlmacen.update({
            where: { id: outputStock.id },
            data: { cantidad: nextOutput, costoPromedio },
          });
        else
          await tx.stockAlmacen.create({
            data: {
              productoId: order.productoId,
              almacenId: order.almacenProductoTerminadoId,
              loteId: lot.id,
              estadoInventarioId: available.id,
              cantidad: dto.cantidadProducida,
              costoPromedio: unitCost,
            },
          });
        await tx.detalleMovimientoInventario.create({
          data: {
            movimientoId: movement.id,
            productoId: order.productoId,
            almacenId: order.almacenProductoTerminadoId,
            loteId: lot.id,
            estadoInventarioId: available.id,
            direccion: 'ENTRADA',
            cantidad: dto.cantidadProducida,
            costoUnitario: unitCost,
            costoTotal: totalCost,
            saldoAnterior: previousOutput,
            saldoPosterior: nextOutput,
          },
        });
        await tx.ordenProduccion.update({
          where: { id: order.id },
          data: {
            estado: 'COMPLETADA',
            cantidadProducida: dto.cantidadProducida,
            merma: dto.merma ?? 0,
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

  private async nextOrderCode() {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .replaceAll('-', '');
    for (let sequence = 1; sequence <= 999; sequence += 1) {
      const code = `OP-${date}-${String(sequence).padStart(3, '0')}`;
      const existing = await this.prisma.ordenProduccion.findUnique({
        where: { codigo: code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    throw new BadRequestException('No se pudo generar el código de producción del día');
  }

  private view(row: any) {
    return {
      id: row.id.toString(),
      codigo: row.codigo,
      producto: row.producto.nombre,
      productoId: row.productoId.toString(),
      almacenInsumos: row.almacenInsumos.nombre,
      almacenProductoTerminado: row.almacenProductoTerminado.nombre,
      cantidadPlanificada: Number(row.cantidadPlanificada),
      cantidadProducida: Number(row.cantidadProducida),
      merma: Number(row.merma),
      costoTotal: Number(row.costoTotal),
      fechaPlanificada: row.fechaPlanificada,
      fechaFin: row.fechaFin,
      estado: row.estado,
      lote: row.lote?.codigoLote ?? row.codigoLote,
      responsable: `${row.trabajador.nombres} ${row.trabajador.apellidos}`,
      kardexId: row.movimientosInventario[0]?.id?.toString() ?? null,
      kardexRef: row.movimientosInventario[0]?.numeroReferencia ?? null,
      insumos: row.consumos.map((item: any) => ({
        producto: item.producto.nombre,
        productoId: item.productoId.toString(),
        planificada: Number(item.cantidadPlanificada),
        consumida: Number(item.cantidadConsumida),
      })),
    };
  }
}
