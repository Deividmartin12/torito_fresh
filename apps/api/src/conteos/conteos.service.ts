import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import {
  EPSILON_CANTIDAD,
  TRANSACCION_DE_STOCK,
  Transaction,
  ensureAvailableState,
  exigirInventario,
  weightedAverage,
} from '../common/stock';
import {
  filtroUnidad,
  filtroUnidadPor,
  resolverAlcanceUnidad,
  resolverUnidadDeEscritura,
} from '../common/unit-context';
import { resolverTrabajadorAutor } from '../common/worker-context';
import { PrismaService } from '../prisma/prisma.service';
import { ConteosQueryDto, CreateConteoDto, LineaConteoDto } from './conteos.dto';

/** Clave de una posición de stock: producto + lote + estado, igual que el índice único. */
const clavePosicion = (productoId: bigint, loteId: bigint | null, estadoId: bigint) =>
  `${productoId}|${loteId ?? ''}|${estadoId}`;

/** Los totales del día de una posición, ya separados por su origen. */
type MovimientosDelDia = {
  producido: number;
  consumido: number;
  vendido: number;
  devuelto: number;
  mermas: number;
  ajustes: number;
  otros: number;
  /** Entradas menos salidas: lo que el día le sumó o restó al saldo. */
  neto: number;
};

const sinMovimientos = (): MovimientosDelDia => ({
  producido: 0,
  consumido: 0,
  vendido: 0,
  devuelto: 0,
  mermas: 0,
  ajustes: 0,
  otros: 0,
  neto: 0,
});

@Injectable()
export class ConteosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La hoja de cuadre de un almacén para un día: qué dice el sistema, de dónde viene ese
   * número y cuánto habría que contar.
   *
   * El teórico NO se recalcula del kardex: es `stock_almacen.cantidad`, el saldo materializado
   * que actualizan en la misma transacción los seis flujos que tocan inventario. El kardex se
   * usa para explicar el día (qué se produjo, qué se vendió) y para retroceder a una fecha
   * pasada, no como fuente del saldo.
   */
  async hoja(actor: AuthUser, almacenId: string, fecha?: string, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const almacen = await this.prisma.almacen.findFirst({
      where: { id: BigInt(almacenId), ...filtroUnidad(alcance) },
      include: { unidadNegocio: { select: { nombre: true, controlaInventario: true } } },
    });
    if (!almacen) throw new NotFoundException('Almacén no encontrado');

    const dia = this.diaValido(fecha);
    const { inicio, fin } = this.rangoDelDia(dia);
    const esHoy = dia === this.hoyEnLima();

    const [posiciones, lineasDelDia, saldosDeSiempre, saldosPosteriores, conteoDelDia] =
      await Promise.all([
        this.prisma.stockAlmacen.findMany({
          where: { almacenId: almacen.id },
          include: {
            producto: {
              select: {
                id: true,
                nombre: true,
                codigo: true,
                unidadMedida: true,
                controlaLote: true,
                costoReferencia: true,
              },
            },
            lote: { select: { id: true, codigoLote: true, estado: true, costoUnitario: true } },
            estadoInventario: { select: { id: true, codigo: true, nombre: true } },
          },
          orderBy: [{ producto: { nombre: 'asc' } }, { id: 'asc' }],
        }),
        this.prisma.detalleMovimientoInventario.findMany({
          where: { almacenId: almacen.id, movimiento: { fecha: { gte: inicio, lt: fin } } },
          select: {
            productoId: true,
            loteId: true,
            estadoInventarioId: true,
            direccion: true,
            cantidad: true,
            movimiento: { select: { tipoOperacion: true } },
          },
        }),
        // Saldo que arroja el kardex completo. Sirve para delatar un descuadre preexistente
        // entre el ledger y el saldo materializado, que es justo la desconfianza que hace
        // falta contar a mano.
        this.saldosPorPosicion(this.prisma, almacen.id),
        // Para una fecha pasada hay que retroceder desde el saldo actual: lo que pasó después
        // de ese día no formaba parte de su cierre.
        esHoy
          ? Promise.resolve(new Map<string, number>())
          : this.saldosPorPosicion(this.prisma, almacen.id, { gte: fin }),
        this.prisma.conteoInventario.findFirst({
          where: { almacenId: almacen.id, fecha: inicio },
          orderBy: { id: 'desc' },
          include: { trabajador: { select: { nombres: true, apellidos: true } } },
        }),
      ]);

    const delDia = new Map<string, MovimientosDelDia>();
    for (const linea of lineasDelDia) {
      const clave = clavePosicion(linea.productoId, linea.loteId, linea.estadoInventarioId);
      const acumulado = delDia.get(clave) ?? sinMovimientos();
      const cantidad = Number(linea.cantidad);
      const entra = linea.direccion === 'ENTRADA';
      acumulado.neto += entra ? cantidad : -cantidad;
      switch (linea.movimiento.tipoOperacion) {
        case 'PRODUCCION':
          // Una producción suma producto terminado y resta insumos, y su reversión invierte
          // las dos cosas. Por eso se separan en dos columnas en vez de netearlas.
          if (entra) acumulado.producido += cantidad;
          else acumulado.consumido += cantidad;
          break;
        case 'VENTA':
          // Una entrada con operación VENTA es la reversión de una venta editada.
          acumulado.vendido += entra ? -cantidad : cantidad;
          break;
        case 'DEVOLUCION_VENTA':
          acumulado.devuelto += cantidad;
          break;
        case 'MERMA':
          acumulado.mermas += cantidad;
          break;
        case 'AJUSTE_POSITIVO':
        case 'AJUSTE_NEGATIVO':
        case 'CARGA_INICIAL':
          acumulado.ajustes += entra ? cantidad : -cantidad;
          break;
        default:
          acumulado.otros += entra ? cantidad : -cantidad;
      }
      delDia.set(clave, acumulado);
    }

    const filas = posiciones.map((posicion) => {
      const clave = clavePosicion(
        posicion.productoId,
        posicion.loteId,
        posicion.estadoInventarioId,
      );
      const movimientos = delDia.get(clave) ?? sinMovimientos();
      const cantidadActual = Number(posicion.cantidad);
      const neto = Number(saldosPosteriores.get(clave) ?? 0);
      const teorico = this.redondear(cantidadActual - neto);
      return {
        stockId: posicion.id.toString(),
        productoId: posicion.productoId.toString(),
        producto: posicion.producto.nombre,
        codigo: posicion.producto.codigo,
        unidadMedida: posicion.producto.unidadMedida,
        controlaLote: posicion.producto.controlaLote,
        loteId: posicion.loteId?.toString() ?? null,
        lote: posicion.lote?.codigoLote ?? 'Sin lote',
        loteEstado: posicion.lote?.estado ?? null,
        estadoInventarioId: posicion.estadoInventarioId.toString(),
        estado: posicion.estadoInventario.codigo,
        saldoInicial: this.redondear(teorico - movimientos.neto),
        producido: this.redondear(movimientos.producido),
        consumido: this.redondear(movimientos.consumido),
        vendido: this.redondear(movimientos.vendido),
        devuelto: this.redondear(movimientos.devuelto),
        mermas: this.redondear(movimientos.mermas),
        ajustes: this.redondear(movimientos.ajustes),
        otros: this.redondear(movimientos.otros),
        teorico,
        costoPromedio: Number(posicion.costoPromedio),
        // Costo con el que entrarían unidades nuevas si el promedio está en cero, que es el
        // caso de toda producción registrada sin insumos.
        costoSugerido: this.costoDe(posicion),
        ledgerCuadra:
          Math.abs(Number(saldosDeSiempre.get(clave) ?? 0) - cantidadActual) < EPSILON_CANTIDAD,
      };
    });

    return {
      almacen: {
        id: almacen.id.toString(),
        nombre: almacen.nombre,
        unidad: almacen.unidadNegocio.nombre,
        controlaInventario: almacen.unidadNegocio.controlaInventario,
      },
      fecha: dia,
      esHoy,
      /** El almacén no tiene ninguna posición: lo que toca es cargar el inventario, no cuadrarlo. */
      primeraCarga: posiciones.length === 0,
      conteoDelDia: conteoDelDia
        ? {
            id: conteoDelDia.id.toString(),
            tipo: conteoDelDia.tipo,
            diferencias: conteoDelDia.diferencias,
            contadas: conteoDelDia.contadas,
            registradoPor: `${conteoDelDia.trabajador.nombres} ${conteoDelDia.trabajador.apellidos}`,
            createdAt: conteoDelDia.createdAt,
          }
        : null,
      totales: {
        posiciones: filas.length,
        teorico: this.redondear(filas.reduce((suma, fila) => suma + fila.teorico, 0)),
        producido: this.redondear(filas.reduce((suma, fila) => suma + fila.producido, 0)),
        vendido: this.redondear(filas.reduce((suma, fila) => suma + fila.vendido, 0)),
        valorizado: this.redondear(
          filas.reduce((suma, fila) => suma + fila.teorico * fila.costoPromedio, 0),
        ),
        posicionesEnCero: filas.filter((fila) => fila.teorico === 0).length,
        ledgerDescuadrado: filas.filter((fila) => !fila.ledgerCuadra).length,
      },
      filas,
    };
  }

  /**
   * Guarda un conteo: deja el stock igual a lo que se contó y escribe en el kardex cada
   * diferencia con su motivo.
   *
   * Se escribe una cabecera de movimiento POR DIRECCIÓN, no una sola: `tipoOperacion` es un
   * campo de cabecera y la dirección es de línea, así que un conteo con faltantes y sobrantes
   * a la vez no cabe en un único movimiento. Salen hasta tres (entradas por sobrante, salidas
   * por faltante y carga inicial), todas colgadas del mismo conteo.
   */
  async create(dto: CreateConteoDto, actor: AuthUser, unidad?: string) {
    const dia = this.diaValido(dto.fecha);
    if (dia > this.hoyEnLima())
      throw new BadRequestException('No se puede contar una fecha futura');
    this.exigirLineasUnicas(dto.lineas);

    const conteoId = await this.prisma.$transaction(
      async (tx) => {
        const unidadNegocioId = await resolverUnidadDeEscritura(tx, {
          actor,
          unidadSolicitada: unidad,
        });
        await exigirInventario(tx, unidadNegocioId);
        const almacen = await tx.almacen.findFirst({
          where: { id: BigInt(dto.almacenId), unidadNegocioId, estado: true },
        });
        if (!almacen)
          throw new BadRequestException('El almacén no existe o no es de esta unidad de negocio');
        const trabajadorId = await resolverTrabajadorAutor(tx, actor, dto.trabajadorId);

        const posiciones = await tx.stockAlmacen.findMany({
          where: {
            almacenId: almacen.id,
            productoId: { in: dto.lineas.map((linea) => BigInt(linea.productoId)) },
          },
          include: {
            producto: { select: { nombre: true, costoReferencia: true } },
            lote: { select: { costoUnitario: true } },
          },
        });
        const porClave = new Map(
          posiciones.map((posicion) => [
            clavePosicion(posicion.productoId, posicion.loteId, posicion.estadoInventarioId),
            posicion,
          ]),
        );
        // Que el almacén no tenga NINGUNA posición es lo que distingue una carga inicial de
        // un cuadre: no hay nada contra qué cuadrar todavía.
        const totalPosiciones = await tx.stockAlmacen.count({ where: { almacenId: almacen.id } });

        // Bloqueo optimista. Sin esto, un conteo hecho a las 7 y guardado a las 7:20 pisaría
        // las ventas del medio: el stock quedaría en lo contado y esas ventas desaparecerían
        // del saldo sin dejar rastro.
        const movidas: string[] = [];
        for (const linea of dto.lineas) {
          const posicion = porClave.get(
            clavePosicion(
              BigInt(linea.productoId),
              linea.loteId ? BigInt(linea.loteId) : null,
              BigInt(linea.estadoInventarioId),
            ),
          );
          const actualReal = Number(posicion?.cantidad ?? 0);
          if (Math.abs(actualReal - linea.teorico) >= EPSILON_CANTIDAD) {
            movidas.push(posicion?.producto.nombre ?? `producto ${linea.productoId}`);
          }
        }
        if (movidas.length && !dto.forzar) {
          throw new ConflictException(
            `El stock cambió mientras contabas (${[...new Set(movidas)].join(', ')}). ` +
              'Volvé a abrir la hoja para contar sobre los números de ahora.',
          );
        }

        const preparadas = dto.lineas.map((linea) => {
          const clave = clavePosicion(
            BigInt(linea.productoId),
            linea.loteId ? BigInt(linea.loteId) : null,
            BigInt(linea.estadoInventarioId),
          );
          const posicion = porClave.get(clave);
          // Con `forzar` la diferencia se aplica sobre el saldo de ahora, no sobre el que se
          // vio al contar: así las ventas del medio se conservan.
          const base = dto.forzar ? Number(posicion?.cantidad ?? 0) : linea.teorico;
          const destino = this.redondear(base + (linea.contado - linea.teorico));
          if (destino < 0)
            throw new BadRequestException(
              `La diferencia de ${posicion?.producto.nombre ?? 'un producto'} dejaría el stock en negativo`,
            );
          return {
            linea,
            posicion,
            anterior: Number(posicion?.cantidad ?? 0),
            destino,
            diferencia: this.redondear(destino - Number(posicion?.cantidad ?? 0)),
            costo: linea.costoUnitario ?? this.costoDe(posicion),
          };
        });

        const conDiferencia = preparadas.filter(
          (fila) => Math.abs(fila.diferencia) >= EPSILON_CANTIDAD,
        );
        const conteo = await tx.conteoInventario.create({
          data: {
            almacenId: almacen.id,
            fecha: this.rangoDelDia(dia).inicio,
            tipo: totalPosiciones === 0 ? 'CARGA_INICIAL' : 'CONTEO',
            trabajadorId,
            posiciones: dto.lineas.length,
            contadas: dto.lineas.length,
            diferencias: conDiferencia.length,
            unidadesSobrantes: conDiferencia
              .filter((fila) => fila.diferencia > 0)
              .reduce((suma, fila) => suma + fila.diferencia, 0),
            unidadesFaltantes: conDiferencia
              .filter((fila) => fila.diferencia < 0)
              .reduce((suma, fila) => suma - fila.diferencia, 0),
            observaciones: dto.observaciones?.trim() || null,
            detalles: {
              create: preparadas.map((fila) => ({
                productoId: BigInt(fila.linea.productoId),
                loteId: fila.linea.loteId ? BigInt(fila.linea.loteId) : null,
                estadoInventarioId: BigInt(fila.linea.estadoInventarioId),
                teorico: fila.linea.teorico,
                contado: fila.linea.contado,
                diferencia: this.redondear(fila.linea.contado - fila.linea.teorico),
                costoUnitario: fila.costo,
                motivo: fila.linea.motivo ?? null,
                nota: fila.linea.nota?.trim() || null,
              })),
            },
          },
        });

        if (!conDiferencia.length) return conteo.id;

        const available = await ensureAvailableState(tx);
        const referencia = `CONT-${conteo.id.toString().padStart(6, '0')}`;
        const baldes = [
          {
            filas: conDiferencia.filter((fila) => !fila.posicion),
            tipoOperacion: 'CARGA_INICIAL',
            sufijo: '-CI',
          },
          {
            filas: conDiferencia.filter((fila) => fila.posicion && fila.diferencia > 0),
            tipoOperacion: 'AJUSTE_POSITIVO',
            sufijo: '',
          },
          {
            filas: conDiferencia.filter((fila) => fila.posicion && fila.diferencia < 0),
            tipoOperacion: 'AJUSTE_NEGATIVO',
            sufijo: '-F',
          },
        ].filter((balde) => balde.filas.length > 0);

        for (const balde of baldes) {
          const entrada = balde.tipoOperacion !== 'AJUSTE_NEGATIVO';
          const movimiento = await tx.movimientoInventario.create({
            data: {
              tipoMovimiento: entrada ? 'ENTRADA' : 'SALIDA',
              tipoOperacion: balde.tipoOperacion,
              // El sobrante viene de fuera del sistema y el faltante se va fuera de él, así
              // que el otro extremo queda en null a propósito. NUNCA se cuelga de una venta:
              // si tuviera `ventaId`, el reporte de negocio le restaría el costo al costo de
              // ventas y el margen saldría mal.
              almacenOrigenId: entrada ? null : almacen.id,
              almacenDestinoId: entrada ? almacen.id : null,
              conteoInventarioId: conteo.id,
              trabajadorId,
              estado: 'CONFIRMADO',
              // La fecha es la del día contado, no "ahora": así ese día cuadra en la hoja y en
              // el kardex. El stock, en cambio, se corrige sobre el saldo actual.
              fecha: this.fechaDelMovimiento(dia),
              numeroReferencia: `${referencia}${balde.sufijo}`,
              observaciones: dto.observaciones?.trim() || 'Ajuste por conteo físico',
            },
          });

          for (const fila of balde.filas) {
            const estadoInventarioId = fila.posicion
              ? fila.posicion.estadoInventarioId
              : BigInt(fila.linea.estadoInventarioId) || available.id;
            if (fila.posicion) {
              await tx.stockAlmacen.update({
                where: { id: fila.posicion.id },
                data: {
                  cantidad: fila.destino,
                  // Las unidades que faltan salen al promedio que ya tenían, así que el
                  // promedio no se mueve; las que sobran entran a su propio costo.
                  costoPromedio:
                    fila.diferencia > 0
                      ? weightedAverage(
                          fila.anterior,
                          Number(fila.posicion.costoPromedio),
                          fila.diferencia,
                          fila.costo,
                        )
                      : Number(fila.posicion.costoPromedio) || fila.costo,
                },
              });
            } else {
              await tx.stockAlmacen.create({
                data: {
                  productoId: BigInt(fila.linea.productoId),
                  almacenId: almacen.id,
                  loteId: fila.linea.loteId ? BigInt(fila.linea.loteId) : null,
                  estadoInventarioId,
                  cantidad: fila.destino,
                  costoPromedio: fila.costo,
                },
              });
            }

            await tx.detalleMovimientoInventario.create({
              data: {
                movimientoId: movimiento.id,
                productoId: BigInt(fila.linea.productoId),
                almacenId: almacen.id,
                loteId: fila.linea.loteId ? BigInt(fila.linea.loteId) : null,
                estadoInventarioId,
                direccion: entrada ? 'ENTRADA' : 'SALIDA',
                cantidad: Math.abs(fila.diferencia),
                costoUnitario: fila.costo,
                costoTotal: this.redondear(Math.abs(fila.diferencia) * fila.costo),
                saldoAnterior: fila.anterior,
                saldoPosterior: fila.destino,
              },
            });
          }
        }

        return conteo.id;
      },
      { ...TRANSACCION_DE_STOCK, timeout: 20_000 },
    );

    return this.detalle(conteoId.toString(), actor, unidad);
  }

  async list(actor: AuthUser, query: ConteosQueryDto, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const rango = this.rangoDeFechas(query.from, query.to);
    const rows = await this.prisma.conteoInventario.findMany({
      where: {
        ...filtroUnidadPor('almacen', alcance),
        ...(query.almacenId ? { almacenId: BigInt(query.almacenId) } : {}),
        ...(rango ? { fecha: rango } : {}),
      },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: query.take ?? 200,
      include: {
        almacen: { select: { nombre: true } },
        trabajador: { select: { nombres: true, apellidos: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id.toString(),
      fecha: row.fecha,
      tipo: row.tipo,
      almacen: row.almacen.nombre,
      registradoPor: `${row.trabajador.nombres} ${row.trabajador.apellidos}`,
      posiciones: row.posiciones,
      contadas: row.contadas,
      diferencias: row.diferencias,
      unidadesSobrantes: Number(row.unidadesSobrantes),
      unidadesFaltantes: Number(row.unidadesFaltantes),
      observaciones: row.observaciones,
      createdAt: row.createdAt,
    }));
  }

  async detalle(id: string, actor: AuthUser, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const row = await this.prisma.conteoInventario.findFirst({
      where: { id: BigInt(id), ...filtroUnidadPor('almacen', alcance) },
      include: {
        almacen: { select: { nombre: true } },
        trabajador: { select: { nombres: true, apellidos: true } },
        movimientos: { select: { id: true, numeroReferencia: true, tipoOperacion: true } },
        detalles: {
          include: {
            producto: { select: { nombre: true, codigo: true, unidadMedida: true } },
            lote: { select: { codigoLote: true } },
            estadoInventario: { select: { codigo: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Conteo no encontrado');
    return {
      id: row.id.toString(),
      fecha: row.fecha,
      tipo: row.tipo,
      almacen: row.almacen.nombre,
      registradoPor: `${row.trabajador.nombres} ${row.trabajador.apellidos}`,
      posiciones: row.posiciones,
      contadas: row.contadas,
      diferencias: row.diferencias,
      unidadesSobrantes: Number(row.unidadesSobrantes),
      unidadesFaltantes: Number(row.unidadesFaltantes),
      observaciones: row.observaciones,
      createdAt: row.createdAt,
      movimientos: row.movimientos.map((movimiento) => ({
        id: movimiento.id.toString(),
        referencia: movimiento.numeroReferencia,
        operacion: movimiento.tipoOperacion,
      })),
      detalles: row.detalles.map((detalle) => ({
        id: detalle.id.toString(),
        producto: detalle.producto.nombre,
        codigo: detalle.producto.codigo,
        unidadMedida: detalle.producto.unidadMedida,
        lote: detalle.lote?.codigoLote ?? 'Sin lote',
        estado: detalle.estadoInventario.codigo,
        teorico: Number(detalle.teorico),
        contado: Number(detalle.contado),
        diferencia: Number(detalle.diferencia),
        costoUnitario: Number(detalle.costoUnitario),
        motivo: detalle.motivo,
        nota: detalle.nota,
      })),
    };
  }

  /**
   * Saldo que arroja el kardex para cada posición de un almacén, opcionalmente acotado por
   * fecha. Es `OperationsService.kardexSaldoInicial` generalizado: aquél colapsa a un escalar
   * para un solo producto, así que llamarlo por posición serían N consultas.
   */
  private async saldosPorPosicion(
    db: Transaction | PrismaService,
    almacenId: bigint,
    fecha?: Prisma.DateTimeFilter,
  ) {
    const grupos = await db.detalleMovimientoInventario.groupBy({
      by: ['productoId', 'loteId', 'estadoInventarioId', 'direccion'],
      where: { almacenId, ...(fecha ? { movimiento: { fecha } } : {}) },
      _sum: { cantidad: true },
    });
    const saldos = new Map<string, number>();
    for (const grupo of grupos) {
      const clave = clavePosicion(grupo.productoId, grupo.loteId, grupo.estadoInventarioId);
      const signo = grupo.direccion === 'ENTRADA' ? 1 : -1;
      saldos.set(clave, (saldos.get(clave) ?? 0) + signo * Number(grupo._sum.cantidad ?? 0));
    }
    return saldos;
  }

  /** Dos líneas para la misma posición se pisarían entre sí al guardar. */
  private exigirLineasUnicas(lineas: LineaConteoDto[]) {
    const claves = new Set(
      lineas.map((linea) =>
        clavePosicion(
          BigInt(linea.productoId),
          linea.loteId ? BigInt(linea.loteId) : null,
          BigInt(linea.estadoInventarioId),
        ),
      ),
    );
    if (claves.size !== lineas.length)
      throw new BadRequestException(
        'Cada producto y lote puede aparecer una sola vez en el conteo',
      );
  }

  /**
   * A qué costo entran unidades nuevas. La cascada importa: una producción registrada sin
   * insumos deja el lote y el promedio en cero, y si se aceptara ese cero la valorización del
   * stock seguiría dando cero para siempre.
   */
  private costoDe(posicion?: {
    costoPromedio: Prisma.Decimal | number;
    producto: { costoReferencia: Prisma.Decimal | number };
    lote: { costoUnitario: Prisma.Decimal | number } | null;
  }) {
    if (!posicion) return 0;
    return (
      Number(posicion.costoPromedio) ||
      Number(posicion.lote?.costoUnitario ?? 0) ||
      Number(posicion.producto.costoReferencia)
    );
  }

  /** `YYYY-MM-DD` válido, con el día de hoy en Lima como valor por defecto. */
  private diaValido(fecha?: string) {
    const dia = (fecha ?? this.hoyEnLima()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new BadRequestException('La fecha no es válida');
    return dia;
  }

  private hoyEnLima() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  }

  /** El día de calendario de Lima, como rango de timestamps. */
  private rangoDelDia(dia: string) {
    const inicio = new Date(`${dia}T00:00:00-05:00`);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 1);
    return { inicio, fin };
  }

  /**
   * El movimiento se fecha en el día contado. Para el día en curso se usa la hora real, para
   * que quede después de las ventas de hoy en el kardex; para un día pasado, su medianoche de
   * Lima, igual que hace producción con `fechaSeleccionada`.
   */
  private fechaDelMovimiento(dia: string) {
    return dia === this.hoyEnLima() ? new Date() : this.rangoDelDia(dia).inicio;
  }

  /** `ConteoInventario.fecha` es columna de solo fecha: se filtra con límites de día de Lima. */
  private rangoDeFechas(from?: string, to?: string) {
    if (!from && !to) return null;
    const rango: Prisma.DateTimeFilter = {};
    if (from) rango.gte = this.rangoDelDia(this.diaValido(from)).inicio;
    if (to) rango.lt = this.rangoDelDia(this.diaValido(to)).fin;
    return rango;
  }

  /** Al milésimo, que es la precisión de `Decimal(12,3)`. */
  private redondear(valor: number) {
    return Math.round(valor * 1000) / 1000;
  }
}
