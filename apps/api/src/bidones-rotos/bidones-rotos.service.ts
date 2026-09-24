import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '../common/auth-user';
import { TRANSACCION_DE_STOCK, Transaction } from '../common/stock';
import {
  filtroUnidad,
  resolverAlcanceUnidad,
  resolverUnidadDeEscritura,
  unidadControlaInventario,
} from '../common/unit-context';
import { exigirTrabajadorId } from '../common/worker-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBidonRotoDto } from './bidones-rotos.dto';

@Injectable()
export class BidonesRotosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser, from?: string, to?: string, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    // `BidonRoto.fecha` es una columna solo-fecha guardada a medianoche UTC; se
    // filtra con límites UTC para que un registro fechado justo en `from` entre y
    // `to` quede incluido.
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
    const rows = await this.prisma.bidonRoto.findMany({
      where: {
        ...filtroUnidad(alcance),
        ...(hasRange ? { fecha: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } } : {}),
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 1000,
      include: { trabajador: true, producto: true, almacen: true },
    });
    return rows.map((row) => this.view(row));
  }

  async create(dto: CreateBidonRotoDto, actor: AuthUser, unidad?: string) {
    const fecha = new Date(`${dto.fecha.slice(0, 10)}T00:00:00-05:00`);
    if (Number.isNaN(fecha.getTime())) throw new BadRequestException('La fecha no es válida');
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (dto.fecha.slice(0, 10) > today)
      throw new BadRequestException('La fecha no puede estar en el futuro');

    const trabajadorId = await exigirTrabajadorId(this.prisma, actor.userId);
    // El bidón se rompió en el puesto donde se está registrando, no en el del trabajador que
    // lo anota: un admin parado en un puesto satélite está anotando la rotura de ESE puesto.
    const unidadNegocioId = await resolverUnidadDeEscritura(this.prisma, {
      actor,
      unidadSolicitada: unidad,
    });

    return this.prisma.$transaction(async (tx) => {
      const almacen = dto.productoId
        ? ((dto.almacenId
            ? await tx.almacen.findFirst({
                where: { id: BigInt(dto.almacenId), unidadNegocioId, estado: true },
              })
            : null) ??
          (await tx.almacen.findFirst({
            where: { unidadNegocioId, estado: true },
            orderBy: { id: 'asc' },
          })))
        : null;
      const llevaInventario = await unidadControlaInventario(tx, unidadNegocioId);

      const row = await tx.bidonRoto.create({
        data: {
          unidadNegocioId,
          fecha,
          cantidad: dto.cantidad,
          observaciones: dto.observaciones?.trim() || null,
          trabajadorId,
          productoId: dto.productoId ? BigInt(dto.productoId) : null,
          almacenId: almacen?.id ?? null,
        },
        include: { trabajador: true, producto: true, almacen: true },
      });

      if (!dto.productoId || !almacen || !llevaInventario) {
        return {
          ...this.view(row),
          aviso: llevaInventario
            ? null
            : 'Esta unidad no lleva inventario, así que la rotura queda solo como registro.',
        };
      }

      const descontado = await this.descontarDelStock(tx, {
        bidonRotoId: row.id,
        productoId: BigInt(dto.productoId),
        almacenId: almacen.id,
        cantidad: dto.cantidad,
        trabajadorId,
        fecha,
        observaciones: dto.observaciones?.trim() || null,
      });

      const actualizado = await tx.bidonRoto.findUniqueOrThrow({
        where: { id: row.id },
        include: { trabajador: true, producto: true, almacen: true },
      });
      // La rotura se registra SIEMPRE, incluso sin stock para descontar: un bidón que se
      // rompió en la calle nunca estuvo en el almacén, y negarse a anotarlo sería perder el
      // dato. Lo que se avisa es que el inventario no se movió, y el chip "solo registro"
      // del listado lo deja a la vista.
      return {
        ...this.view(actualizado),
        aviso:
          descontado === 0
            ? `No había stock de ${row.producto?.nombre ?? 'ese producto'} en ${almacen.nombre}: la rotura quedó registrada sin descontar del inventario.`
            : descontado < dto.cantidad
              ? `Solo había ${descontado} de ${dto.cantidad} en ${almacen.nombre}: se descontó lo que había.`
              : null,
      };
    }, TRANSACCION_DE_STOCK);
  }

  /**
   * Saca las unidades del almacén y las deja en el kardex como merma. Toma primero de los
   * lotes más viejos, con el mismo criterio que usa la venta (`saleableStockRows`) y no el
   * `updatedAt` que usa el consumo de insumos, que no es FIFO real.
   *
   * Devuelve cuánto se pudo descontar, que puede ser menos de lo pedido.
   */
  private async descontarDelStock(
    tx: Transaction,
    params: {
      bidonRotoId: bigint;
      productoId: bigint;
      almacenId: bigint;
      cantidad: number;
      trabajadorId: bigint;
      fecha: Date;
      observaciones: string | null;
    },
  ) {
    const posiciones = await tx.stockAlmacen.findMany({
      where: {
        productoId: params.productoId,
        almacenId: params.almacenId,
        cantidad: { gt: 0 },
      },
      include: { lote: { select: { fechaProduccion: true } } },
      orderBy: [{ lote: { fechaProduccion: 'asc' } }, { id: 'asc' }],
    });
    const disponible = posiciones.reduce((suma, fila) => suma + Number(fila.cantidad), 0);
    if (disponible <= 0) return 0;

    const aDescontar = Math.min(disponible, params.cantidad);
    const movimiento = await tx.movimientoInventario.create({
      data: {
        tipoMovimiento: 'SALIDA',
        tipoOperacion: 'MERMA',
        // Sale del almacén y no entra a ningún otro lado: el destino queda en null a
        // propósito. Nunca se cuelga de una venta ni de una producción.
        almacenOrigenId: params.almacenId,
        trabajadorId: params.trabajadorId,
        estado: 'CONFIRMADO',
        fecha: params.fecha,
        numeroReferencia: `ROT-${params.bidonRotoId.toString().padStart(6, '0')}`,
        observaciones: params.observaciones ?? 'Bidones rotos dados de baja',
      },
    });

    let restante = aDescontar;
    for (const posicion of posiciones) {
      if (restante <= 0) break;
      const anterior = Number(posicion.cantidad);
      const toma = Math.min(anterior, restante);
      const siguiente = anterior - toma;
      restante -= toma;
      await tx.stockAlmacen.update({
        where: { id: posicion.id },
        data: { cantidad: siguiente },
      });
      const costo = Number(posicion.costoPromedio);
      await tx.detalleMovimientoInventario.create({
        data: {
          movimientoId: movimiento.id,
          productoId: posicion.productoId,
          almacenId: posicion.almacenId,
          loteId: posicion.loteId,
          estadoInventarioId: posicion.estadoInventarioId,
          direccion: 'SALIDA',
          cantidad: toma,
          costoUnitario: costo,
          costoTotal: Math.round(toma * costo * 100) / 100,
          saldoAnterior: anterior,
          saldoPosterior: siguiente,
        },
      });
    }

    await tx.bidonRoto.update({
      where: { id: params.bidonRotoId },
      data: { movimientoInventarioId: movimiento.id },
    });
    return aDescontar;
  }

  private view(row: any) {
    return {
      id: row.id.toString(),
      fecha: row.fecha,
      cantidad: row.cantidad,
      observaciones: row.observaciones,
      registradoPor: row.trabajador
        ? `${row.trabajador.nombres} ${row.trabajador.apellidos}`
        : null,
      producto: row.producto?.nombre ?? null,
      almacen: row.almacen?.nombre ?? null,
      // Distingue las roturas que movieron el inventario de las que quedaron como registro.
      // Sin esto, un período que cruce el cambio mezclaría dos cosas distintas en un total.
      descontado: Boolean(row.movimientoInventarioId),
    };
  }
}
