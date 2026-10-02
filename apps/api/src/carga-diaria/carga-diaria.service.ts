import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthUser, tienePermiso } from '../common/auth-user';
import { etiquetaMetodoPago } from '../common/payment-method-label';
import { CATEGORIA_GASTOS_DEL_DIA } from '../common/expense-categories';
import { limaTodayKey } from '../common/receivables';
import { TRANSACCION_DE_STOCK } from '../common/stock';
import { resolverUnidadDeEscritura, unidadControlaInventario } from '../common/unit-context';
import { exigirTrabajadorId } from '../common/worker-context';
import { CreateOperationalSaleDto, UpdateOperationalSaleDto } from '../operations/operations.dto';
import { OperationsService } from '../operations/operations.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionService } from '../production/production.service';
import { DiaCarga, RegistrarCargaDiariaDto } from './carga-diaria.dto';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CLIENTE_DEL_DIA = 'Ventas del día';
const MAX_DIAS_CONSULTA = 93;

const revisionDia = (registros: unknown[]) =>
  createHash('sha256')
    .update(
      JSON.stringify(registros, (_, valor) =>
        typeof valor === 'bigint' ? valor.toString() : valor,
      ),
    )
    .digest('hex');

/** `2026-09-23` → Date a medianoche UTC, que es como Postgres devuelve una columna `date`. */
const diaUtc = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`);
const claveDia = (fecha: Date) => fecha.toISOString().slice(0, 10);
const codigoVenta = (id: bigint) => `V-${id.toString().padStart(6, '0')}`;
const PRIMERAS_CATEGORIAS = ['EFECTIVO', 'YAPE'];
const ordenCategoria = (nombre: string) => {
  const indice = PRIMERAS_CATEGORIAS.indexOf(nombre.trim().toUpperCase());
  return indice === -1 ? PRIMERAS_CATEGORIAS.length : indice;
};

/**
 * Carga de totales diarios: lo que el negocio recibe como "el día X se produjeron N bidones,
 * se vendieron S/ A en efectivo y S/ B por Yape, y se gastó S/ C".
 *
 * Cada total se convierte en el registro real que le corresponde —una orden de producción,
 * una venta por método de pago, un gasto—, fechado ese día. Así los números aparecen solos
 * en Ventas, Producción, Gastos, el kardex, el panel y los reportes, sin que ninguna pantalla
 * tenga que saber que existió esta carga. La tabla `registro_diario` solo recuerda qué se
 * cargó por acá, para no duplicar un día.
 */
@Injectable()
export class CargaDiariaService {
  private readonly logger = new Logger(CargaDiariaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationsService,
    private readonly production: ProductionService,
  ) {}

  async resumen(actor: AuthUser, desde?: string, hasta?: string, unidad?: string) {
    if (!desde || !hasta || !FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta)
      throw new BadRequestException('El rango de fechas no es válido');
    const dias = (diaUtc(hasta).getTime() - diaUtc(desde).getTime()) / 86_400_000 + 1;
    if (dias > MAX_DIAS_CONSULTA)
      throw new BadRequestException('Elige un rango de hasta tres meses para cargar');

    const unidadNegocioId = await resolverUnidadDeEscritura(this.prisma, {
      actor,
      unidadSolicitada: unidad,
    });
    const trabajadorId = await exigirTrabajadorId(this.prisma, actor.userId);
    const [controlaInventario, metodos, productos, registros] = await Promise.all([
      unidadControlaInventario(this.prisma, unidadNegocioId),
      this.prisma.metodoPago.findMany({
        where: {
          estado: true,
          categoria: { estado: true },
          OR: [
            { trabajadorId: null },
            { trabajadorId },
            ...(tienePermiso(actor, 'operaciones.atribuir')
              ? [{ trabajador: { estado: true, unidadNegocioId } }]
              : []),
          ],
        },
        orderBy: { id: 'asc' },
        include: { categoria: true },
      }),
      this.prisma.producto.findMany({
        where: { estado: true },
        include: { tipoProducto: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.registroDiario.findMany({
        where: { unidadNegocioId, fecha: { gte: diaUtc(desde), lte: diaUtc(hasta) } },
        orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      }),
    ]);

    // Lo que se produce y se vende: los productos terminados, no los insumos. Es la misma
    // separación que usa el formulario de producción.
    const terminados = productos.filter(
      (item) => item.tipoProducto.nombre.toLowerCase() !== 'insumo',
    );
    const porDefecto = terminados.find((item) => item.esRetornable) ?? terminados[0];

    const ordenes = await this.prisma.ordenProduccion.findMany({
      where: {
        id: {
          in: registros.flatMap((row) => (row.ordenProduccionId ? [row.ordenProduccionId] : [])),
        },
      },
      select: { id: true, codigo: true, productoId: true },
    });
    const ventasGuardadas = await this.prisma.venta.findMany({
      where: { id: { in: registros.flatMap((r) => (r.ventaId ? [r.ventaId] : [])) } },
      select: { id: true, detalles: { select: { productoId: true } } },
    });
    const codigoOrden = new Map(ordenes.map((row) => [row.id, row.codigo]));

    const porDia = new Map<
      string,
      {
        fecha: string;
        produccion: { cantidad: number; partes: number[] | null; codigo: string | null } | null;
        ventas: {
          metodoPagoId: string;
          categoriaId: string;
          monto: number;
          cantidad: number;
          codigo: string | null;
        }[];
        gasto: { monto: number; partes: number[] | null } | null;
      }
    >();
    for (const row of registros) {
      const fecha = claveDia(row.fecha);
      const dia = porDia.get(fecha) ?? { fecha, produccion: null, ventas: [], gasto: null };
      if (row.concepto === 'PRODUCCION')
        dia.produccion = {
          cantidad: row.cantidad,
          partes: Array.isArray(row.partes) ? row.partes.map(Number) : null,
          codigo: row.ordenProduccionId ? (codigoOrden.get(row.ordenProduccionId) ?? null) : null,
        };
      else if (row.concepto === 'VENTA')
        dia.ventas.push({
          metodoPagoId:
            row.metodoPagoId === 0n
              ? `anterior:${row.categoriaMetodoPagoId}`
              : row.metodoPagoId.toString(),
          categoriaId: row.categoriaMetodoPagoId.toString(),
          monto: Number(row.monto),
          cantidad: row.cantidad,
          codigo: row.ventaId ? codigoVenta(row.ventaId) : null,
        });
      else if (row.concepto === 'GASTO')
        dia.gasto = {
          monto: Number(row.monto),
          partes: Array.isArray(row.partes) ? row.partes.map(Number) : null,
        };
      porDia.set(fecha, dia);
    }

    return {
      hoy: limaTodayKey(),
      controlaInventario,
      // Efectivo y Yape primero, que son los que llegan todos los días; el resto después.
      metodos: [...metodos]
        .sort(
          (a, b) =>
            ordenCategoria(a.categoria?.nombre ?? '') - ordenCategoria(b.categoria?.nombre ?? '') ||
            etiquetaMetodoPago(a).localeCompare(etiquetaMetodoPago(b), 'es', { numeric: true }),
        )
        .map((row) => ({
          id: row.id.toString(),
          nombre: etiquetaMetodoPago(row),
          categoriaId: row.categoriaId?.toString() ?? '0',
        })),
      historicos: await this.metodosHistoricos(registros, metodos),
      productos: terminados.map((row) => ({
        id: row.id.toString(),
        nombre: row.nombre,
        precio: Number(row.precioVenta),
        retornable: row.esRetornable,
      })),
      productoPorDefectoId: porDefecto?.id.toString() ?? null,
      dias: [...porDia.values()].map((dia) => {
        const filas = registros.filter((r) => claveDia(r.fecha) === dia.fecha);
        const orden = ordenes.find((o) => filas.some((r) => r.ordenProduccionId === o.id));
        const venta = ventasGuardadas.find((v) => filas.some((r) => r.ventaId === v.id));
        const datosVenta = filas.find((r) => r.concepto === 'VENTA')?.partes;
        const productoAnterior =
          datosVenta && !Array.isArray(datosVenta) && typeof datosVenta === 'object'
            ? datosVenta.productoId
            : null;
        return {
          ...dia,
          productoId:
            (orden?.productoId ?? venta?.detalles[0]?.productoId)?.toString() ??
            (typeof productoAnterior === 'string' ? productoAnterior : null),
          revision: revisionDia(filas),
        };
      }),
    };
  }

  /**
   * Registra los días de uno en uno, del más viejo al más nuevo, cada uno en su propia
   * transacción: un día que falla (por ejemplo, porque vende más de lo que había en stock) no
   * tumba a los demás. Dentro del día el orden es producción → ventas → gasto, para que lo
   * producido ese día ya esté disponible para lo que se vendió.
   */
  async registrar(dto: RegistrarCargaDiariaDto, actor: AuthUser, unidad?: string) {
    const unidadNegocioId = await resolverUnidadDeEscritura(this.prisma, {
      actor,
      unidadSolicitada: unidad,
    });
    const producto = await this.prisma.producto.findFirst({
      where: { id: BigInt(dto.productoId), estado: true },
    });
    if (!producto) throw new BadRequestException('El producto elegido no existe o está inactivo');

    const fechas = dto.dias.map((dia) => dia.fecha);
    if (new Set(fechas).size !== fechas.length)
      throw new BadRequestException('Cada día debe aparecer una sola vez');

    const dias = [...dto.dias].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const resultados: { fecha: string; ok: boolean; error?: string }[] = [];
    for (const dia of dias) {
      try {
        await this.prisma.$transaction(
          (tx) =>
            this.registrarDia(tx, dia, {
              actor,
              unidad,
              unidadNegocioId,
              producto: {
                id: producto.id,
                precio: Number(producto.precioVenta),
                retornable: producto.esRetornable,
              },
            }),
          { ...TRANSACCION_DE_STOCK, timeout: 15000 },
        );
        resultados.push({ fecha: dia.fecha, ok: true });
      } catch (cause) {
        resultados.push({ fecha: dia.fecha, ok: false, error: this.motivo(cause) });
      }
    }
    return { resultados };
  }

  private async registrarDia(
    tx: Prisma.TransactionClient,
    dia: DiaCarga,
    ctx: {
      actor: AuthUser;
      unidad?: string;
      unidadNegocioId: bigint;
      producto: { id: bigint; precio: number; retornable: boolean };
    },
  ) {
    const fecha = dia.fecha;
    if (
      !FECHA.test(fecha) ||
      Number.isNaN(diaUtc(fecha).getTime()) ||
      claveDia(diaUtc(fecha)) !== fecha
    )
      throw new BadRequestException('La fecha no es válida');
    if (fecha > limaTodayKey())
      throw new BadRequestException('No se pueden cargar días que todavía no pasaron');
    if (
      (dia.producciones && dia.produccion !== undefined) ||
      (dia.gastos && dia.gasto !== undefined)
    )
      throw new BadRequestException('Envía las dos partes o el total, no ambos');
    const produccionEntrada = dia.producciones?.reduce((a, b) => a + b, 0) ?? dia.produccion;
    const gastoEntrada = dia.gastos
      ? dia.gastos.reduce((a, b) => a + Math.round(b * 100), 0) / 100
      : dia.gasto;
    if ((produccionEntrada ?? 0) > 1_000_000 || (gastoEntrada ?? 0) > 9_999_999)
      throw new BadRequestException('El total de producción o gastos supera el máximo permitido');
    const entradas = dia.ventas ?? [];
    if (new Set(entradas.map((v) => v.metodoPagoId)).size !== entradas.length)
      throw new BadRequestException('Cada método de pago va una sola vez por día');
    const registros = await tx.registroDiario.findMany({
      where: { unidadNegocioId: ctx.unidadNegocioId, fecha: diaUtc(fecha) },
      orderBy: { id: 'asc' },
    });
    const produccion = registros.find((r) => r.concepto === 'PRODUCCION');
    const gasto = registros.find((r) => r.concepto === 'GASTO');
    const ventasPrevias = registros.filter((r) => r.concepto === 'VENTA');
    if (dia.editar) {
      if (!registros.length || dia.revision !== revisionDia(registros))
        throw new BadRequestException(
          'Este día cambió desde que lo abriste. Recarga la tabla antes de editar',
        );
    } else {
      if (produccion && produccionEntrada !== undefined)
        throw new BadRequestException('La producción de este día ya estaba cargada. Usa Editar');
      if (gasto && gastoEntrada !== undefined)
        throw new BadRequestException('El gasto de este día ya estaba cargado. Usa Editar');
      if (
        entradas.some((v) => ventasPrevias.some((r) => r.metodoPagoId === BigInt(v.metodoPagoId)))
      )
        throw new BadRequestException('Las ventas de este día ya estaban cargadas. Usa Editar');
      if (!produccionEntrada && !gastoEntrada && !entradas.some((v) => v.monto > 0))
        throw new BadRequestException('El día no tiene nada para registrar');
    }
    const cantidadProducida = produccionEntrada ?? produccion?.cantidad ?? 0;
    const ventas: { metodoPagoId: bigint; monto: number; registro?: (typeof registros)[number] }[] =
      ventasPrevias.map((registro) => ({
        metodoPagoId: registro.metodoPagoId,
        monto:
          entradas.find((v) => BigInt(v.metodoPagoId) === registro.metodoPagoId)?.monto ??
          Number(registro.monto),
        registro,
      }));
    for (const entrada of entradas) {
      if (!ventas.some((v) => v.metodoPagoId === BigInt(entrada.metodoPagoId)) && entrada.monto > 0)
        ventas.push({ metodoPagoId: BigInt(entrada.metodoPagoId), monto: entrada.monto });
    }
    const positivas = ventas.filter((v) => v.monto > 0);
    const cambiaProduccion = cantidadProducida !== (produccion?.cantidad ?? 0);
    const recalcularVentas =
      ventas.length > 0 &&
      (cambiaProduccion ||
        (dia.editar && cantidadProducida > 0) ||
        ventas.some((v) => !v.registro || v.monto !== Number(v.registro.monto)) ||
        (cantidadProducida > 0 &&
          ventasPrevias.reduce((suma, v) => suma + v.cantidad, 0) !== cantidadProducida));
    if (
      recalcularVentas &&
      positivas.length &&
      cantidadProducida === 0 &&
      (produccion || produccionEntrada !== undefined)
    )
      throw new BadRequestException('Hay ventas: ingresa la producción del día antes de guardar');
    const cantidades =
      cantidadProducida > 0 && positivas.length
        ? repartirCantidad(
            cantidadProducida,
            positivas.map((v) => v.monto),
          )
        : null;
    if (recalcularVentas && positivas.length && !cantidades && ctx.producto.precio <= 0)
      throw new BadRequestException(
        'El producto no tiene precio de venta para calcular los bidones',
      );
    const trabajadorId = await exigirTrabajadorId(tx, ctx.actor.userId);
    const controlaInventario = await unidadControlaInventario(tx, ctx.unidadNegocioId);
    const bitacora = { unidadNegocioId: ctx.unidadNegocioId, fecha: diaUtc(fecha), trabajadorId };
    let orden = produccion?.ordenProduccionId
      ? await tx.ordenProduccion.findUniqueOrThrow({ where: { id: produccion.ordenProduccionId } })
      : null;
    if (
      orden &&
      (orden.productoId !== ctx.producto.id ||
        Number(orden.cantidadProducida) !== produccion!.cantidad)
    )
      throw new BadRequestException(
        'La producción cambió fuera de esta carga o pertenece a otro producto. Revisa Producción',
      );
    const ventasReales = await tx.venta.findMany({
      where: {
        id: { in: ventasPrevias.flatMap((v) => (v.ventaId ? [v.ventaId] : [])) },
        unidadNegocioId: ctx.unidadNegocioId,
      },
      include: { detalles: true },
    });
    if (recalcularVentas) {
      if (ventasPrevias.some((r) => !r.ventaId) || ventas.some((v) => v.metodoPagoId === 0n))
        throw new BadRequestException(
          'Hay ventas antiguas sin método identificado. Revisa esas ventas antes de corregir el día',
        );
      for (const registro of ventasPrevias) {
        const venta = ventasReales.find((v) => v.id === registro.ventaId);
        if (
          !venta ||
          Number(venta.total) !== Number(registro.monto) ||
          venta.detalles.some((d) => d.productoId !== ctx.producto.id) ||
          venta.detalles.reduce((n, d) => n + Number(d.cantidad), 0) !== registro.cantidad
        )
          throw new BadRequestException(
            'Una venta cambió fuera de esta carga diaria. Revisa Ventas antes de corregir el día',
          );
        if (controlaInventario)
          await this.operations.reverseSaleOutbound(tx, venta.id, venta.fecha);
      }
    }
    if (cantidadProducida > 0 && !produccion) {
      const ordenId = await this.production.registrarProduccion(
        tx,
        {
          productoId: Number(ctx.producto.id),
          cantidadPlanificada: cantidadProducida,
          fechaPlanificada: fecha,
        },
        ctx.actor,
        ctx.unidad,
        { fecharKardex: true },
      );
      orden = await tx.ordenProduccion.findUniqueOrThrow({ where: { id: ordenId } });
      await tx.registroDiario.create({
        data: {
          ...bitacora,
          concepto: 'PRODUCCION',
          cantidad: cantidadProducida,
          partes: dia.producciones,
          ordenProduccionId: ordenId,
        },
      });
    } else if (produccion && produccionEntrada !== undefined) {
      if (!orden) throw new BadRequestException('No se encontró la orden de producción del día');
      if (cambiaProduccion) {
        if (!controlaInventario)
          throw new BadRequestException('Esta unidad ya no controla inventario');
        orden = await this.production.ajustarCantidadCargaDiaria(
          tx,
          orden.id,
          cantidadProducida,
          ctx.unidadNegocioId,
        );
      }
      await tx.registroDiario.update({
        where: { id: produccion.id },
        data: {
          cantidad: cantidadProducida,
          partes: dia.producciones ?? [cantidadProducida, 0],
        },
      });
    }
    if (recalcularVentas) {
      const clienteId = await this.clienteDelDia(tx, ctx.unidadNegocioId);
      for (const venta of ventas) {
        const metodo = await tx.metodoPago.findFirst({
          where: { id: venta.metodoPagoId, estado: true, categoria: { estado: true } },
          include: { trabajador: true },
        });
        if (!metodo || !metodo.categoriaId)
          throw new BadRequestException(
            'Un método de pago del día está inactivo; actívalo para corregir las ventas',
          );
        if (
          metodo.trabajadorId !== null &&
          metodo.trabajadorId !== trabajadorId &&
          (!tienePermiso(ctx.actor, 'operaciones.atribuir') ||
            !metodo.trabajador?.estado ||
            metodo.trabajador.unidadNegocioId !== ctx.unidadNegocioId)
        )
          throw new BadRequestException('El método de pago pertenece a otro trabajador');
        if (
          ventasPrevias.some(
            (r) => r.metodoPagoId === 0n && r.categoriaMetodoPagoId === metodo.categoriaId,
          )
        )
          throw new BadRequestException(
            'Esta categoría tiene una carga anterior sin método identificado',
          );
        const indice = positivas.indexOf(venta);
        const cantidad =
          venta.monto > 0
            ? (cantidades?.[indice] ?? cantidadPorPrecio(venta.monto, ctx.producto.precio))
            : 0;
        const real = ventasReales.find((v) => v.id === venta.registro?.ventaId);
        const dtoVenta = {
          clienteId: Number(real?.clienteId ?? clienteId),
          almacenId: orden
            ? Number(orden.almacenProductoTerminadoId)
            : real
              ? Number(real.almacenOrigenId)
              : undefined,
          ...(metodo.trabajadorId !== null &&
          metodo.trabajadorId !== (real?.trabajadorId ?? trabajadorId)
            ? { trabajadorId: Number(metodo.trabajadorId) }
            : {}),
          tipoPago: 'CONTADO',
          pagosIniciales:
            venta.monto > 0 ? [{ metodoPagoId: Number(metodo.id), monto: venta.monto }] : [],
          items: cantidad ? lineasPorMonto(venta.monto, cantidad, Number(ctx.producto.id)) : [],
          vaciosDevueltos: ctx.producto.retornable ? cantidad : 0,
        } as CreateOperationalSaleDto;
        const loteId = cantidadProducida > 0 ? (orden?.loteId ?? undefined) : undefined;
        if (real) {
          await this.operations.actualizarVentaEnTransaccion(
            tx,
            real.id.toString(),
            dtoVenta as UpdateOperationalSaleDto,
            ctx.actor,
            ctx.unidad,
            {
              fecharEnLaVenta: true,
              inventarioRevertido: controlaInventario,
              loteId,
              permitirVacia: true,
            },
          );
          await tx.registroDiario.update({
            where: { id: venta.registro!.id },
            data: {
              monto: venta.monto,
              cantidad,
              partes: { productoId: ctx.producto.id.toString() },
            },
          });
        } else {
          const ventaId = await this.operations.registrarVenta(
            tx,
            dtoVenta,
            ctx.actor,
            ctx.unidad,
            { fecha, loteId },
          );
          await tx.registroDiario.create({
            data: {
              ...bitacora,
              concepto: 'VENTA',
              categoriaMetodoPagoId: metodo.categoriaId,
              metodoPagoId: metodo.id,
              monto: venta.monto,
              cantidad,
              ventaId,
              partes: { productoId: ctx.producto.id.toString() },
            },
          });
        }
      }
    }
    if (gastoEntrada !== undefined) {
      if (gasto) {
        const real = gasto.gastoId
          ? await tx.gasto.findFirst({
              where: { id: gasto.gastoId, unidadNegocioId: ctx.unidadNegocioId },
            })
          : null;
        if (!real || Number(real.monto) !== Number(gasto.monto))
          throw new BadRequestException(
            'El gasto cambió fuera de esta carga diaria. Revisa Gastos',
          );
        if ((real as { estado?: string }).estado === 'ANULADO')
          throw new BadRequestException(
            'Este gasto fue revertido desde Gastos. Vuelve a cargarlo desde esta pantalla.',
          );
        await tx.gasto.update({ where: { id: real.id }, data: { monto: gastoEntrada } });
        await tx.registroDiario.update({
          where: { id: gasto.id },
          data: { monto: gastoEntrada, partes: dia.gastos ?? [gastoEntrada, 0] },
        });
      } else if (gastoEntrada > 0) {
        const categoria = await this.categoriaGastosDelDia(tx);
        const nuevo = await tx.gasto.create({
          data: {
            unidadNegocioId: ctx.unidadNegocioId,
            fecha: new Date(`${fecha}T00:00:00-05:00`),
            concepto: CATEGORIA_GASTOS_DEL_DIA,
            categoriaId: categoria.id,
            monto: gastoEntrada,
            observaciones: 'Total del día cargado desde la carga diaria',
            trabajadorId,
          },
        });
        await tx.registroDiario.create({
          data: {
            ...bitacora,
            concepto: 'GASTO',
            monto: gastoEntrada,
            partes: dia.gastos,
            gastoId: nuevo.id,
          },
        });
      }
    }
  }

  /** Corrige cargas anteriores con las mismas garantías que la edición de la tabla. */
  async consumirProduccionDelDia(fecha: string, actor: AuthUser, unidad?: string) {
    const resumen = await this.resumen(actor, fecha, fecha, unidad);
    const dia = resumen.dias[0];
    if (!dia?.productoId || !dia.produccion || !dia.ventas.length) return { resultados: [] };
    return this.registrar(
      {
        productoId: Number(dia.productoId),
        dias: [{ fecha, editar: true, revision: dia.revision }],
      },
      actor,
      unidad,
    );
  }

  /** El cliente "Ventas del día" de la unidad; se crea la primera vez que hace falta. */
  private async clienteDelDia(tx: Prisma.TransactionClient, unidadNegocioId: bigint) {
    const existente = await tx.cliente.findFirst({
      where: { unidadNegocioId, sistema: true },
      select: { id: true },
    });
    if (existente) return existente.id;
    const creado = await tx.cliente.create({
      data: { unidadNegocioId, nombreLegal: CLIENTE_DEL_DIA, sistema: true },
      select: { id: true },
    });
    return creado.id;
  }

  private async metodosHistoricos(
    registros: { concepto: string; metodoPagoId: bigint; categoriaMetodoPagoId: bigint }[],
    disponibles: { id: bigint }[],
  ) {
    const ids = [
      ...new Set(
        registros
          .filter(
            (r) =>
              r.concepto === 'VENTA' &&
              r.metodoPagoId !== 0n &&
              !disponibles.some((m) => m.id === r.metodoPagoId),
          )
          .map((r) => r.metodoPagoId),
      ),
    ];
    const filas = await this.prisma.metodoPago.findMany({
      where: { id: { in: ids } },
      include: { categoria: true },
    });
    const historicos = ids.map((id) => {
      const metodo = filas.find((m) => m.id === id);
      return {
        id: id.toString(),
        nombre: `${metodo ? etiquetaMetodoPago(metodo) : 'Método ' + id} (histórico)`,
        categoriaId: registros.find((r) => r.metodoPagoId === id)!.categoriaMetodoPagoId.toString(),
      };
    });
    const categorias = [
      ...new Set(
        registros
          .filter((r) => r.concepto === 'VENTA' && r.metodoPagoId === 0n)
          .map((r) => r.categoriaMetodoPagoId),
      ),
    ];
    const nombres = await this.prisma.categoriaMetodoPago.findMany({
      where: { id: { in: categorias } },
    });
    return [
      ...historicos,
      ...categorias.map((id) => ({
        id: `anterior:${id}`,
        nombre: `${nombres.find((c) => c.id === id)?.nombre ?? 'Categoría'} (carga anterior)`,
        categoriaId: id.toString(),
      })),
    ];
  }

  private async categoriaGastosDelDia(tx: Prisma.TransactionClient) {
    return tx.categoriaGasto.upsert({
      where: { nombre: CATEGORIA_GASTOS_DEL_DIA },
      update: {},
      create: { nombre: CATEGORIA_GASTOS_DEL_DIA, sistema: true },
      select: { id: true },
    });
  }

  private motivo(cause: unknown): string {
    if (cause instanceof HttpException) {
      const respuesta = cause.getResponse();
      const mensaje =
        typeof respuesta === 'object' && respuesta && 'message' in respuesta
          ? (respuesta as { message: unknown }).message
          : cause.message;
      return Array.isArray(mensaje) ? mensaje.join('. ') : String(mensaje);
    }
    if (cause instanceof Prisma.PrismaClientKnownRequestError) {
      if (cause.code === 'P2002') return 'Este día ya estaba cargado';
      if (cause.code === 'P2034')
        return 'Otro registro se guardó al mismo tiempo. Vuelve a guardar este día.';
    }
    this.logger.error(cause);
    return 'No se pudo registrar este día';
  }
}

/** Bidones que corresponden a un monto cuando no hay producción del día: `monto ÷ precio`. */
export const cantidadPorPrecio = (monto: number, precio: number) =>
  Math.max(1, Math.round(monto / precio));

/**
 * Reparte `total` unidades entre varios montos, en proporción a cada monto (método del mayor
 * resto), con al menos una unidad por monto. La suma da exactamente `total`.
 * Ejemplo: 141 bidones entre S/ 214 y S/ 485 → 43 y 98.
 */
export function repartirCantidad(total: number, montos: number[]) {
  if (
    !montos.length ||
    !Number.isInteger(total) ||
    total < montos.length ||
    montos.some((m) => !Number.isFinite(m) || m <= 0)
  )
    throw new BadRequestException(
      'La producción debe tener al menos un bidón por cada método de pago con ventas',
    );
  const suma = montos.reduce((acumulado, monto) => acumulado + monto, 0);
  const libres = total - montos.length;
  const exactas = montos.map((monto) => (monto / suma) * libres);
  const cantidades = exactas.map((valor) => 1 + Math.floor(valor));
  let restantes = total - cantidades.reduce((acumulado, valor) => acumulado + valor, 0);
  const porResto = exactas
    .map((valor, indice) => ({ indice, resto: valor - Math.floor(valor) }))
    .sort((a, b) => b.resto - a.resto);
  for (const { indice } of porResto) {
    if (restantes <= 0) break;
    cantidades[indice] += 1;
    restantes -= 1;
  }
  return cantidades;
}

/**
 * Convierte un monto y una cantidad en líneas de venta del producto.
 *
 * Casi nunca el monto se divide exacto entre la cantidad, así que el precio se reparte en
 * céntimos: `resto` unidades llevan un céntimo más que las demás. Así la suma de las líneas da
 * exactamente el monto tecleado, sin descuentos inventados.
 * Ejemplo: S/ 100.01 en 5 bidones → 4 a S/ 20.00 y 1 a S/ 20.01.
 */
export function lineasPorMonto(monto: number, cantidad: number, productoId: number) {
  const centimos = Math.round(monto * 100);
  const base = Math.floor(centimos / cantidad);
  const resto = centimos - base * cantidad;
  return [
    { cantidad: cantidad - resto, precioUnitario: base / 100 },
    { cantidad: resto, precioUnitario: (base + 1) / 100 },
  ]
    .filter((linea) => linea.cantidad > 0)
    .map((linea) => ({ productoId, ...linea }));
}
