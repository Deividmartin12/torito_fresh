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
            lote: {
              select: { id: true, codigoLote: true, estado: true, costoUnitario: true, createdAt: true },
            },
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

    // La hoja agrupa por PRODUCTO: todos los lotes de un producto se cuentan juntos y el
    // ajuste cae en el lote más antiguo (PEPS). Lo por posición se calcula igual que antes
    // (el kardex y los saldos viven por posición) y después se agrega por producto + estado.
    // Del más antiguo al más nuevo dentro de cada producto: las posiciones sin lote
    // (legado) se consideran las más viejas.
    const ordenadas = [...posiciones].sort((a, b) => {
      const porNombre = a.producto.nombre.localeCompare(b.producto.nombre);
      if (porNombre !== 0) return porNombre;
      if (a.estadoInventarioId !== b.estadoInventarioId)
        return a.estadoInventarioId < b.estadoInventarioId ? -1 : 1;
      const fechaA = a.lote?.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const fechaB = b.lote?.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      if (fechaA !== fechaB) return fechaA - fechaB;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    type GrupoProducto = {
      stockId: null;
      productoId: string;
      producto: string;
      codigo: string;
      unidadMedida: string;
      estadoInventarioId: string;
      estado: string;
      /** Cuántas posiciones de stock se agregaron. Solo informativo. */
      posiciones: number;
      /** Referencia de los lotes agregados, del más antiguo al más nuevo. */
      lotes: { lote: string; teorico: number }[];
      saldoInicial: number;
      producido: number;
      consumido: number;
      vendido: number;
      devuelto: number;
      mermas: number;
      ajustes: number;
      otros: number;
      teorico: number;
      costoPromedio: number;
      costoSugerido: number;
      ledgerCuadra: boolean;
      /** Acumulador interno:Σ teórico × promedio por posición. No sale en la respuesta. */
      valorizado: number;
      /** Si ya se tomó el costo sugerido (el de la posición más antigua). No sale. */
      sugeridoTomado: boolean;
    };
    const porGrupo = new Map<string, GrupoProducto>();
    const filas: GrupoProducto[] = [];
    for (const posicion of ordenadas) {
      const clave = clavePosicion(
        posicion.productoId,
        posicion.loteId,
        posicion.estadoInventarioId,
      );
      const movimientos = delDia.get(clave) ?? sinMovimientos();
      const cantidadActual = Number(posicion.cantidad);
      const neto = Number(saldosPosteriores.get(clave) ?? 0);
      const teorico = this.redondear(cantidadActual - neto);
      const costoPromedio = Number(posicion.costoPromedio);
      const claveGrupo = `${posicion.productoId}|${posicion.estadoInventarioId}`;
      let grupo = porGrupo.get(claveGrupo);
      if (!grupo) {
        grupo = {
          stockId: null,
          productoId: posicion.productoId.toString(),
          producto: posicion.producto.nombre,
          codigo: posicion.producto.codigo,
          unidadMedida: posicion.producto.unidadMedida,
          estadoInventarioId: posicion.estadoInventarioId.toString(),
          estado: posicion.estadoInventario.codigo,
          posiciones: 0,
          lotes: [],
          saldoInicial: 0,
          producido: 0,
          consumido: 0,
          vendido: 0,
          devuelto: 0,
          mermas: 0,
          ajustes: 0,
          otros: 0,
          teorico: 0,
          costoPromedio: 0,
          costoSugerido: 0,
          ledgerCuadra: true,
          valorizado: 0,
          sugeridoTomado: false,
        };
        porGrupo.set(claveGrupo, grupo);
        filas.push(grupo);
      }
      grupo.posiciones += 1;
      grupo.lotes.push({ lote: posicion.lote?.codigoLote ?? 'Sin lote', teorico });
      grupo.saldoInicial = this.redondear(grupo.saldoInicial + (teorico - movimientos.neto));
      grupo.producido = this.redondear(grupo.producido + movimientos.producido);
      grupo.consumido = this.redondear(grupo.consumido + movimientos.consumido);
      grupo.vendido = this.redondear(grupo.vendido + movimientos.vendido);
      grupo.devuelto = this.redondear(grupo.devuelto + movimientos.devuelto);
      grupo.mermas = this.redondear(grupo.mermas + movimientos.mermas);
      grupo.ajustes = this.redondear(grupo.ajustes + movimientos.ajustes);
      grupo.otros = this.redondear(grupo.otros + movimientos.otros);
      grupo.teorico = this.redondear(grupo.teorico + teorico);
      grupo.valorizado += teorico * costoPromedio;
      if (!grupo.sugeridoTomado) {
        // Costo con el que entrarían unidades nuevas si el promedio está en cero, que es
        // el caso de toda producción registrada sin insumos. Se toma de la posición más
        // antigua, que es la primera del grupo.
        grupo.costoSugerido = this.costoDe(posicion);
        grupo.sugeridoTomado = true;
      }
      grupo.ledgerCuadra =
        grupo.ledgerCuadra &&
        Math.abs(Number(saldosDeSiempre.get(clave) ?? 0) - cantidadActual) < EPSILON_CANTIDAD;
    }
    // Promedio ponderado del producto para mostrar y valorizar. Los internos no salen.
    const filasRespuesta = filas.map(
      ({ valorizado, sugeridoTomado, ...grupo }) => ({
        ...grupo,
        costoPromedio:
          grupo.teorico !== 0 ? this.redondear(valorizado / grupo.teorico) : 0,
      }),
    );

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
        posiciones: filasRespuesta.length,
        teorico: this.redondear(
          filasRespuesta.reduce((suma, fila) => suma + fila.teorico, 0),
        ),
        producido: this.redondear(
          filasRespuesta.reduce((suma, fila) => suma + fila.producido, 0),
        ),
        vendido: this.redondear(
          filasRespuesta.reduce((suma, fila) => suma + fila.vendido, 0),
        ),
        valorizado: this.redondear(
          filas.reduce((suma, fila) => suma + fila.valorizado, 0),
        ),
        posicionesEnCero: filasRespuesta.filter((fila) => fila.teorico === 0).length,
        ledgerDescuadrado: filasRespuesta.filter((fila) => !fila.ledgerCuadra).length,
      },
      filas: filasRespuesta,
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
            lote: { select: { costoUnitario: true, createdAt: true } },
          },
        });
        // Las líneas vienen agregadas por producto (sin lote): el ajuste se aplica sobre
        // los lotes del producto del más antiguo al más nuevo (PEPS). Las posiciones sin
        // lote (legado) se consideran las más viejas.
        const porProducto = new Map<string, typeof posiciones>();
        for (const posicion of posiciones) {
          const grupo = `${posicion.productoId}|${posicion.estadoInventarioId}`;
          const lista = porProducto.get(grupo) ?? [];
          lista.push(posicion);
          porProducto.set(grupo, lista);
        }
        for (const lista of porProducto.values()) {
          lista.sort((a, b) => {
            const fechaA = a.lote?.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY;
            const fechaB = b.lote?.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY;
            if (fechaA !== fechaB) return fechaA - fechaB;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          });
        }
        const grupoDe = (linea: LineaConteoDto) =>
          porProducto.get(`${BigInt(linea.productoId)}|${BigInt(linea.estadoInventarioId)}`) ??
          [];
        // Que el almacén no tenga NINGUNA posición es lo que distingue una carga inicial de
        // un cuadre: no hay nada contra qué cuadrar todavía.
        const totalPosiciones = await tx.stockAlmacen.count({ where: { almacenId: almacen.id } });

        // Bloqueo optimista. Sin esto, un conteo hecho a las 7 y guardado a las 7:20 pisaría
        // las ventas del medio: el stock quedaría en lo contado y esas ventas desaparecerían
        // del saldo sin dejar rastro. Se compara por producto, que es la unidad del conteo.
        const movidas: string[] = [];
        for (const linea of dto.lineas) {
          const actualReal = this.redondear(
            grupoDe(linea).reduce((suma, posicion) => suma + Number(posicion.cantidad), 0),
          );
          if (Math.abs(actualReal - linea.teorico) >= EPSILON_CANTIDAD) {
            const lista = grupoDe(linea);
            movidas.push(lista[0]?.producto.nombre ?? `producto ${linea.productoId}`);
          }
        }
        if (movidas.length && !dto.forzar) {
          throw new ConflictException(
            `El stock cambió mientras contabas (${[...new Set(movidas)].join(', ')}). ` +
              'Volvé a abrir la hoja para contar sobre los números de ahora.',
          );
        }

        // Una línea = un producto contado. La diferencia se reparte sobre sus lotes del
        // más antiguo al más nuevo: el sobrante entra entero al lote más viejo y el
        // faltante se descuenta en orden hasta cubrirlo.
        type AplicacionAjuste = {
          linea: LineaConteoDto;
          posicion: (typeof posiciones)[number] | null;
          anterior: number;
          destino: number;
          diferencia: number;
          costo: number;
        };
        const lineasPreparadas = dto.lineas.map((linea) => {
          const lista = grupoDe(linea);
          const nombre = lista[0]?.producto.nombre ?? `producto ${linea.productoId}`;
          const actualTotal = this.redondear(
            lista.reduce((suma, posicion) => suma + Number(posicion.cantidad), 0),
          );
          // Con `forzar` la diferencia se aplica sobre el saldo de ahora, no sobre el que se
          // vio al contar: así las ventas del medio se conservan.
          const base = dto.forzar ? actualTotal : linea.teorico;
          const destinoTotal = this.redondear(base + (linea.contado - linea.teorico));
          if (destinoTotal < 0)
            throw new BadRequestException(
              `La diferencia de ${nombre} dejaría el stock en negativo`,
            );
          return {
            linea,
            nombre,
            lista,
            destinoTotal,
            diferenciaTotal: this.redondear(destinoTotal - actualTotal),
          };
        });

        const aplicaciones: AplicacionAjuste[] = [];
        for (const preparada of lineasPreparadas) {
          const { linea, nombre, lista, destinoTotal, diferenciaTotal } = preparada;
          if (Math.abs(diferenciaTotal) < EPSILON_CANTIDAD) continue;
          if (lista.length === 0) {
            aplicaciones.push({
              linea,
              posicion: null,
              anterior: 0,
              destino: destinoTotal,
              diferencia: diferenciaTotal,
              costo: linea.costoUnitario ?? 0,
            });
            continue;
          }
          if (diferenciaTotal > 0) {
            const vieja = lista[0];
            const anterior = Number(vieja.cantidad);
            aplicaciones.push({
              linea,
              posicion: vieja,
              anterior,
              destino: this.redondear(anterior + diferenciaTotal),
              diferencia: diferenciaTotal,
              costo: linea.costoUnitario ?? this.costoDe(vieja),
            });
          } else {
            let falta = -diferenciaTotal;
            for (const posicion of lista) {
              if (falta < EPSILON_CANTIDAD) break;
              const anterior = Number(posicion.cantidad);
              const quita = Math.min(falta, anterior);
              if (quita < EPSILON_CANTIDAD) continue;
              aplicaciones.push({
                linea,
                posicion,
                anterior,
                destino: this.redondear(anterior - quita),
                diferencia: this.redondear(-quita),
                costo: this.costoDe(posicion),
              });
              falta = this.redondear(falta - quita);
            }
            if (falta >= EPSILON_CANTIDAD)
              throw new BadRequestException(
                `La diferencia de ${nombre} dejaría el stock en negativo`,
              );
          }
        }

        const conDiferencia = lineasPreparadas.filter(
          (fila) => Math.abs(fila.diferenciaTotal) >= EPSILON_CANTIDAD,
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
              .filter((fila) => fila.diferenciaTotal > 0)
              .reduce((suma, fila) => suma + fila.diferenciaTotal, 0),
            unidadesFaltantes: conDiferencia
              .filter((fila) => fila.diferenciaTotal < 0)
              .reduce((suma, fila) => suma - fila.diferenciaTotal, 0),
            observaciones: dto.observaciones?.trim() || null,
            // El detalle queda a nivel producto (sin lote): el lote que absorbió cada
            // diferencia vive en el kardex, que sí lo registra por posición.
            detalles: {
              create: lineasPreparadas.map((preparada) => {
                const aplicacion = aplicaciones.find((item) => item.linea === preparada.linea);
                return {
                  productoId: BigInt(preparada.linea.productoId),
                  loteId: null,
                  estadoInventarioId: BigInt(preparada.linea.estadoInventarioId),
                  teorico: preparada.linea.teorico,
                  contado: preparada.linea.contado,
                  diferencia: this.redondear(
                    preparada.linea.contado - preparada.linea.teorico,
                  ),
                  costoUnitario:
                    aplicacion?.costo ?? preparada.linea.costoUnitario ?? 0,
                  motivo: preparada.linea.motivo ?? null,
                  nota: preparada.linea.nota?.trim() || null,
                };
              }),
            },
          },
        });

        if (!conDiferencia.length) return conteo.id;

        const available = await ensureAvailableState(tx);
        const referencia = `CONT-${conteo.id.toString().padStart(6, '0')}`;
        const baldes = [
          {
            filas: aplicaciones.filter((fila) => !fila.posicion),
            tipoOperacion: 'CARGA_INICIAL',
            sufijo: '-CI',
          },
          {
            filas: aplicaciones.filter((fila) => fila.posicion && fila.diferencia > 0),
            tipoOperacion: 'AJUSTE_POSITIVO',
            sufijo: '',
          },
          {
            filas: aplicaciones.filter((fila) => fila.posicion && fila.diferencia < 0),
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
                  loteId: fila.posicion?.loteId ?? null,
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
                loteId: fila.posicion?.loteId ?? null,
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

  /** Dos líneas para el mismo producto se pisarían entre sí al guardar. */
  private exigirLineasUnicas(lineas: LineaConteoDto[]) {
    const claves = new Set(
      lineas.map(
        (linea) => `${BigInt(linea.productoId)}|${BigInt(linea.estadoInventarioId)}`,
      ),
    );
    if (claves.size !== lineas.length)
      throw new BadRequestException(
        'Cada producto puede aparecer una sola vez en el conteo',
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
