import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CATEGORIA_GASTOS_DEL_DIA } from '../common/expense-categories';
import { limaTodayKey } from '../common/receivables';
import { TRANSACCION_DE_STOCK, Transaction } from '../common/stock';
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

type Concepto = 'PRODUCCION' | 'VENTA' | 'GASTO';

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
 * una venta por categoría de pago, un gasto—, fechado ese día. Así los números aparecen solos
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
    const [controlaInventario, categorias, productos, registros] = await Promise.all([
      unidadControlaInventario(this.prisma, unidadNegocioId),
      this.prisma.categoriaMetodoPago.findMany({
        where: { estado: true },
        orderBy: { id: 'asc' },
        select: { id: true, nombre: true },
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
      select: { id: true, codigo: true },
    });
    const codigoOrden = new Map(ordenes.map((row) => [row.id, row.codigo]));

    const porDia = new Map<
      string,
      {
        fecha: string;
        produccion: { cantidad: number; codigo: string | null } | null;
        ventas: { categoriaId: string; monto: number; cantidad: number; codigo: string | null }[];
        gasto: { monto: number } | null;
      }
    >();
    for (const row of registros) {
      const fecha = claveDia(row.fecha);
      const dia = porDia.get(fecha) ?? { fecha, produccion: null, ventas: [], gasto: null };
      if (row.concepto === 'PRODUCCION')
        dia.produccion = {
          cantidad: row.cantidad,
          codigo: row.ordenProduccionId ? (codigoOrden.get(row.ordenProduccionId) ?? null) : null,
        };
      else if (row.concepto === 'VENTA')
        dia.ventas.push({
          categoriaId: row.categoriaMetodoPagoId.toString(),
          monto: Number(row.monto),
          cantidad: row.cantidad,
          codigo: row.ventaId ? codigoVenta(row.ventaId) : null,
        });
      else if (row.concepto === 'GASTO') dia.gasto = { monto: Number(row.monto) };
      porDia.set(fecha, dia);
    }

    return {
      hoy: limaTodayKey(),
      controlaInventario,
      // Efectivo y Yape primero, que son los que llegan todos los días; el resto después.
      categorias: [...categorias]
        .sort((a, b) => ordenCategoria(a.nombre) - ordenCategoria(b.nombre))
        .map((row) => ({ id: row.id.toString(), nombre: row.nombre })),
      productos: terminados.map((row) => ({
        id: row.id.toString(),
        nombre: row.nombre,
        precio: Number(row.precioVenta),
        retornable: row.esRetornable,
      })),
      productoPorDefectoId: porDefecto?.id.toString() ?? null,
      dias: [...porDia.values()],
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
          TRANSACCION_DE_STOCK,
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
    if (Number.isNaN(diaUtc(fecha).getTime()) || claveDia(diaUtc(fecha)) !== fecha)
      throw new BadRequestException('La fecha no es válida');
    if (fecha > limaTodayKey())
      throw new BadRequestException('No se pueden cargar días que todavía no pasaron');

    const ventas = (dia.ventas ?? []).filter((venta) => venta.monto > 0);
    const categoriasRepetidas = new Set(ventas.map((venta) => venta.categoriaId));
    if (categoriasRepetidas.size !== ventas.length)
      throw new BadRequestException('Cada método de pago va una sola vez por día');
    if (!dia.produccion && !ventas.length && !dia.gasto)
      throw new BadRequestException('El día no tiene nada para registrar');

    const yaCargados = await tx.registroDiario.findMany({
      where: { unidadNegocioId: ctx.unidadNegocioId, fecha: diaUtc(fecha) },
      select: { concepto: true, categoriaMetodoPagoId: true, cantidad: true },
    });
    const cargado = (concepto: Concepto, categoriaId = 0n) =>
      yaCargados.some(
        (row) => row.concepto === concepto && row.categoriaMetodoPagoId === categoriaId,
      );
    if (dia.produccion && cargado('PRODUCCION'))
      throw new BadRequestException('La producción de este día ya estaba cargada');
    if (dia.gasto && cargado('GASTO'))
      throw new BadRequestException('El gasto de este día ya estaba cargado');
    for (const venta of ventas)
      if (cargado('VENTA', BigInt(venta.categoriaId)))
        throw new BadRequestException('Las ventas de este día ya estaban cargadas');

    const trabajadorId = await exigirTrabajadorId(tx, ctx.actor.userId);
    const bitacora = {
      unidadNegocioId: ctx.unidadNegocioId,
      fecha: diaUtc(fecha),
      trabajadorId,
    };

    if (dia.produccion) {
      if (!(await unidadControlaInventario(tx, ctx.unidadNegocioId)))
        throw new BadRequestException(
          'Esta unidad no lleva inventario: no se le registra producción',
        );
      const ordenId = await this.production.registrarProduccion(
        tx,
        {
          productoId: Number(ctx.producto.id),
          cantidadPlanificada: dia.produccion,
          fechaPlanificada: fecha,
        },
        ctx.actor,
        ctx.unidad,
        { fecharKardex: true },
      );
      await tx.registroDiario.create({
        data: {
          ...bitacora,
          concepto: 'PRODUCCION',
          cantidad: dia.produccion,
          ordenProduccionId: ordenId,
        },
      });
    }

    if (ventas.length) {
      // Lo producido en el día se consume ese mismo día: las ventas se llevan toda la
      // producción, repartida entre los métodos de pago según el monto de cada uno. Cuenta
      // también la producción cargada antes para ese día, menos lo que ya se vendió en él.
      const producidoDia =
        dia.produccion ?? yaCargados.find((row) => row.concepto === 'PRODUCCION')?.cantidad ?? 0;
      const vendidoDia = yaCargados
        .filter((row) => row.concepto === 'VENTA')
        .reduce((suma, row) => suma + row.cantidad, 0);
      const porConsumir = producidoDia - vendidoDia;
      // Sin producción del día (o si no alcanza para al menos un bidón por método), la
      // cantidad se calcula con el precio del producto, como antes.
      const cantidades =
        porConsumir >= ventas.length
          ? repartirCantidad(
              porConsumir,
              ventas.map((venta) => venta.monto),
            )
          : null;
      if (!cantidades && ctx.producto.precio <= 0)
        throw new BadRequestException(
          'El producto no tiene precio de venta: no se puede calcular cuántos se vendieron',
        );
      const clienteId = await this.clienteDelDia(tx, ctx.unidadNegocioId);
      for (const [indice, venta] of ventas.entries()) {
        const categoriaId = BigInt(venta.categoriaId);
        const metodoPagoId = await this.metodoGlobal(tx, categoriaId);
        const items = lineasPorMonto(
          venta.monto,
          cantidades?.[indice] ?? cantidadPorPrecio(venta.monto, ctx.producto.precio),
          Number(ctx.producto.id),
        );
        const cantidad = items.reduce((suma, item) => suma + item.cantidad, 0);
        const ventaId = await this.operations.registrarVenta(
          tx as Transaction,
          {
            clienteId: Number(clienteId),
            tipoPago: 'CONTADO',
            pagosIniciales: [{ metodoPagoId: Number(metodoPagoId), monto: venta.monto }],
            items,
            // Canje uno a uno: el cliente genérico no acumula deuda de envases.
            vaciosDevueltos: ctx.producto.retornable ? cantidad : 0,
          } as CreateOperationalSaleDto,
          ctx.actor,
          ctx.unidad,
          { fecha },
        );
        await tx.registroDiario.create({
          data: {
            ...bitacora,
            concepto: 'VENTA',
            categoriaMetodoPagoId: categoriaId,
            monto: venta.monto,
            cantidad,
            ventaId,
          },
        });
      }
    }

    if (dia.gasto) {
      const categoria = await this.categoriaGastosDelDia(tx);
      const gasto = await tx.gasto.create({
        data: {
          unidadNegocioId: ctx.unidadNegocioId,
          // Mismo criterio que ExpensesService.create: el día calendario de Lima.
          fecha: new Date(`${fecha}T00:00:00-05:00`),
          concepto: CATEGORIA_GASTOS_DEL_DIA,
          categoriaId: categoria.id,
          monto: dia.gasto,
          observaciones: 'Total del día cargado desde la carga diaria',
          trabajadorId,
        },
      });
      await tx.registroDiario.create({
        data: { ...bitacora, concepto: 'GASTO', monto: dia.gasto, gastoId: gasto.id },
      });
    }
  }

  /**
   * Corrige un día cargado antes de que las ventas consumieran toda la producción: vuelve a
   * repartir los bidones producidos entre las ventas del día y edita cada venta con su cantidad
   * nueva. La edición revierte la salida vieja y escribe la nueva (el kardex no se borra), todo
   * fechado ese mismo día. Los montos cobrados no cambian.
   */
  async consumirProduccionDelDia(fecha: string, actor: AuthUser, unidad?: string) {
    const unidadNegocioId = await resolverUnidadDeEscritura(this.prisma, {
      actor,
      unidadSolicitada: unidad,
    });
    const registros = await this.prisma.registroDiario.findMany({
      where: { unidadNegocioId, fecha: diaUtc(fecha) },
      orderBy: { id: 'asc' },
    });
    const produccion = registros.find((row) => row.concepto === 'PRODUCCION');
    const ventas = registros.filter((row) => row.concepto === 'VENTA' && row.ventaId);
    if (!produccion || !ventas.length) return { fecha, cambios: [] };
    const cantidades = repartirCantidad(
      produccion.cantidad,
      ventas.map((row) => Number(row.monto)),
    );

    const cambios: { venta: string; antes: number; despues: number }[] = [];
    for (const [indice, registro] of ventas.entries()) {
      const cantidad = cantidades[indice];
      if (cantidad === registro.cantidad) continue;
      const venta = await this.prisma.venta.findUniqueOrThrow({
        where: { id: registro.ventaId! },
        include: {
          detalles: { include: { producto: true } },
          cuentaCobrar: { include: { pagos: { where: { origen: 'VENTA' } } } },
        },
      });
      const producto = venta.detalles[0].producto;
      const monto = Number(registro.monto);
      const pagos = venta.cuentaCobrar?.pagos ?? [];
      await this.operations.updateSale(
        venta.id.toString(),
        {
          clienteId: Number(venta.clienteId),
          almacenId: Number(venta.almacenOrigenId),
          tipoPago: 'CONTADO',
          pagosIniciales: pagos.map((pago) => ({
            metodoPagoId: Number(pago.metodoPagoId),
            monto: Number(pago.monto),
          })),
          items: lineasPorMonto(monto, cantidad, Number(producto.id)),
          vaciosDevueltos: producto.esRetornable ? cantidad : 0,
        } as UpdateOperationalSaleDto,
        actor,
        unidad,
        { fecharEnLaVenta: true },
      );
      await this.prisma.registroDiario.update({ where: { id: registro.id }, data: { cantidad } });
      cambios.push({ venta: codigoVenta(venta.id), antes: registro.cantidad, despues: cantidad });
    }
    return { fecha, cambios };
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

  /**
   * El método de pago con el que se registra lo cobrado en una categoría. Tiene que ser uno
   * global (sin dueño): los de un trabajador solo los puede usar ese trabajador. Si la
   * categoría no tiene ninguno, se crea.
   */
  private async metodoGlobal(tx: Prisma.TransactionClient, categoriaId: bigint) {
    const categoria = await tx.categoriaMetodoPago.findFirst({
      where: { id: categoriaId, estado: true },
      select: { id: true },
    });
    if (!categoria) throw new BadRequestException('Uno de los métodos de pago no está disponible');
    const existente = await tx.metodoPago.findFirst({
      where: { categoriaId, trabajadorId: null, estado: true },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (existente) return existente.id;
    const creado = await tx.metodoPago.create({
      data: { categoriaId },
      select: { id: true },
    });
    return creado.id;
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
