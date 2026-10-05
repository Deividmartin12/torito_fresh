import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import {
  cuentaCaja,
  sincronizarGastoCaja,
  sincronizarPagoCaja,
  transaccionCaja,
} from '../common/caja-ledger';
import { etiquetaMetodoPago } from '../common/payment-method-label';
import { limaTodayKey } from '../common/receivables';
import { Transaction } from '../common/stock';
import {
  filtroUnidad,
  resolverAlcanceUnidad,
  resolverUnidadDeEscritura,
} from '../common/unit-context';
import { exigirTrabajadorId } from '../common/worker-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  AjusteCajaDto,
  AperturaCajaDto,
  MovimientoCajaDto,
  TransferenciaCajaDto,
} from './caja.dto';

const include = {
  unidadNegocio: true,
  metodoPago: { include: { categoria: true, trabajador: true } },
} as const;
const TIPOS = [
  'COBRO',
  'REEMBOLSO',
  'GASTO',
  'REVERSION',
  'APORTE',
  'DEPOSITO',
  'RETIRO',
  'TRANSFERENCIA_ENTRADA',
  'TRANSFERENCIA_SALIDA',
  'AJUSTE',
];

function day(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('La fecha no es válida');
  return new Date(`${value}T00:00:00-05:00`);
}

@Injectable()
export class CajaService {
  constructor(private readonly prisma: PrismaService) {}

  async cuentas(actor: AuthUser, unidad?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const scope = await resolverAlcanceUnidad(tx, actor, unidad);
        const units = await tx.unidadNegocio.findMany({
          where: {
            estado: true,
            ...(scope.tipo === 'una'
              ? { id: scope.id }
              : scope.tipo === 'varias'
                ? { id: { in: scope.ids } }
                : {}),
          },
          orderBy: { id: 'asc' },
        });
        const accounts = await tx.cuentaCaja.findMany({ where: filtroUnidad(scope), include });
        const methods = await tx.metodoPago.findMany({
          include: { categoria: true, trabajador: true },
          orderBy: { id: 'asc' },
        });
        const opened = accounts.filter((a) => a.fechaApertura);
        // Incluye los registros confirmados de hoy aunque su hora represente un día completo (Carga diaria).
        const corte = day(limaTodayKey());
        corte.setUTCDate(corte.getUTCDate() + 1);
        const sums = opened.length
          ? await Promise.all(
              [1, -1].map((sign) =>
                tx.movimientoCaja.groupBy({
                  by: ['cuentaId'],
                  where: {
                    OR: opened.map((a) => ({
                      cuentaId: a.id,
                      fecha: { gte: a.fechaApertura!, lt: corte },
                    })),
                    importe: sign > 0 ? { gt: 0 } : { lt: 0 },
                  },
                  _sum: { importe: true },
                }),
              ),
            )
          : [[], []];
        const positive = new Map(sums[0].map((s) => [s.cuentaId, s._sum.importe]));
        const negative = new Map(sums[1].map((s) => [s.cuentaId, s._sum.importe]));
        const result: any[] = [];
        for (const u of units)
          for (const m of methods) {
            const saved = accounts.find(
              (a) => a.unidadNegocioId === u.id && a.metodoPagoId === m.id,
            );
            if (
              !saved &&
              (!m.estado ||
                m.categoria?.estado === false ||
                (m.trabajador && m.trabajador.unidadNegocioId !== u.id))
            )
              continue;
            const ingresos = (saved ? positive.get(saved.id) : null) ?? new Prisma.Decimal(0);
            const salidas = (
              (saved ? negative.get(saved.id) : null) ?? new Prisma.Decimal(0)
            ).negated();
            const saldo =
              saved?.saldoInicial != null
                ? saved.saldoInicial.plus(ingresos).minus(salidas).toNumber()
                : null;
            result.push({
              id: saved?.id.toString() ?? null,
              unidadNegocioId: u.id.toString(),
              unidad: u.nombre,
              metodoPagoId: m.id.toString(),
              metodo: etiquetaMetodoPago(m),
              responsable: m.trabajador
                ? `${m.trabajador.nombres} ${m.trabajador.apellidos}`
                : 'Compartido',
              activo: m.estado && m.categoria?.estado !== false,
              saldoInicial: saved?.saldoInicial?.toNumber() ?? null,
              fechaApertura: saved?.fechaApertura ?? null,
              saldo,
              ingresos: ingresos.toNumber(),
              salidas: salidas.toNumber(),
              version: saved?.version ?? 0,
            });
          }
        return result;
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }

  async apertura(dto: AperturaCajaDto, actor: AuthUser, unidad?: string) {
    return transaccionCaja(this.prisma, async (tx) => {
      const unit = await resolverUnidadDeEscritura(tx, {
        actor,
        unidadSolicitada: dto.unidadNegocioId ?? unidad,
      });
      const method = await tx.metodoPago.findUnique({
        where: { id: BigInt(dto.metodoPagoId) },
        include: { categoria: true, trabajador: true },
      });
      if (dto.unidadNegocioId && BigInt(dto.unidadNegocioId) !== unit)
        throw new BadRequestException('No puedes abrir una cuenta de otra unidad');
      if (!method?.estado || method.categoria?.estado === false)
        throw new BadRequestException('Selecciona un método activo de esta unidad');
      const start = day(dto.fecha);
      if (dto.fecha > limaTodayKey())
        throw new BadRequestException('La apertura no puede estar en el futuro');
      const account = await cuentaCaja(tx, unit, method.id);
      if (account.fechaApertura)
        throw new ConflictException(
          'Esta cuenta ya tiene apertura. Usa un ajuste para corregirla.',
        );
      const worker = await exigirTrabajadorId(tx, actor.userId);
      await tx.cuentaCaja.update({
        where: { id: account.id },
        data: { saldoInicial: dto.saldoInicial, fechaApertura: start, version: { increment: 1 } },
      });
      // Incorpora registros previos del período una sola vez, mediante el mismo conciliador de fuentes.
      const pagos = await tx.pagoCliente.findMany({
        where: {
          metodoPagoId: method.id,
          estado: 'CONFIRMADO',
          fechaPago: { gte: new Date(`${dto.fecha}T00:00:00Z`) },
          cuentaCobrar: { venta: { unidadNegocioId: unit } },
        },
        select: { id: true },
      });
      const gastos = await tx.gasto.findMany({
        where: {
          metodoPagoId: method.id,
          estado: 'CONFIRMADO',
          unidadNegocioId: unit,
          fecha: { gte: new Date(`${dto.fecha}T00:00:00Z`) },
        },
        select: { id: true },
      });
      for (const pago of pagos) await sincronizarPagoCaja(tx, pago.id);
      for (const gasto of gastos) await sincronizarGastoCaja(tx, gasto.id);
      await tx.movimientoCaja.create({
        data: {
          cuentaId: account.id,
          tipo: 'APERTURA',
          importe: 0,
          fecha: start,
          trabajadorId: worker,
          descripcion: `Saldo inicial: S/ ${dto.saldoInicial.toFixed(2)}`,
        },
      });
      return { id: account.id.toString() };
    });
  }

  private async cuentaAutorizada(tx: Transaction, id: string, actor: AuthUser, escritura = false) {
    if (!/^[1-9]\d*$/.test(id)) throw new BadRequestException('Cuenta no válida');
    const account = await tx.cuentaCaja.findUnique({ where: { id: BigInt(id) }, include });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    const scope = await resolverAlcanceUnidad(tx, actor, account.unidadNegocioId.toString());
    if (
      (scope.tipo === 'una' && scope.id !== account.unidadNegocioId) ||
      (scope.tipo === 'varias' && !scope.ids.includes(account.unidadNegocioId))
    )
      throw new NotFoundException('Cuenta no encontrada');
    if (!account.fechaApertura)
      throw new BadRequestException('Registra primero el saldo inicial de esta cuenta');
    if (
      escritura &&
      (!account.unidadNegocio.estado ||
        !account.metodoPago.estado ||
        account.metodoPago.categoria?.estado === false)
    )
      throw new BadRequestException('Esta cuenta está inactiva');
    return account;
  }

  private fechaManual(fecha: string | undefined, apertura: Date) {
    const value = fecha ? new Date(fecha) : new Date();
    if (Number.isNaN(value.getTime()) || value > new Date() || value < apertura)
      throw new BadRequestException('La fecha debe estar entre la apertura y el momento actual');
    return value;
  }

  private async saldo(
    tx: Transaction,
    account: { id: bigint; fechaApertura: Date | null; saldoInicial: Prisma.Decimal | null },
  ) {
    const corte = day(limaTodayKey());
    corte.setUTCDate(corte.getUTCDate() + 1);
    const sum = await tx.movimientoCaja.aggregate({
      where: { cuentaId: account.id, fecha: { gte: account.fechaApertura!, lt: corte } },
      _sum: { importe: true },
    });
    return account.saldoInicial!.plus(sum._sum.importe ?? 0);
  }

  async manual(dto: MovimientoCajaDto, actor: AuthUser) {
    return transaccionCaja(this.prisma, async (tx) => {
      const account = await this.cuentaAutorizada(tx, dto.cuentaId, actor, true);
      const key = `manual:${dto.operacionId}`;
      const old = await tx.movimientoCaja.findUnique({ where: { claveOperacion: key } });
      if (old) {
        if (old.cuentaId !== account.id)
          throw new ConflictException('La operación ya pertenece a otra cuenta');
        if (
          old.tipo !== dto.tipo ||
          !old.importe.equals(new Prisma.Decimal(dto.monto).mul(dto.tipo === 'RETIRO' ? -1 : 1)) ||
          old.descripcion !== dto.motivo.trim() ||
          (dto.fecha && old.fecha.getTime() !== new Date(dto.fecha).getTime())
        )
          throw new ConflictException('El identificador ya fue usado para un movimiento diferente');
        return { id: old.id.toString() };
      }
      const row = await tx.movimientoCaja.create({
        data: {
          cuentaId: account.id,
          tipo: dto.tipo,
          importe: new Prisma.Decimal(dto.monto).mul(dto.tipo === 'RETIRO' ? -1 : 1),
          fecha: this.fechaManual(dto.fecha, account.fechaApertura!),
          trabajadorId: await exigirTrabajadorId(tx, actor.userId),
          descripcion: dto.motivo.trim(),
          claveOperacion: key,
        },
      });
      await tx.cuentaCaja.update({
        where: { id: account.id },
        data: { version: { increment: 1 } },
      });
      return { id: row.id.toString() };
    });
  }

  async transferir(dto: TransferenciaCajaDto, actor: AuthUser) {
    if (dto.origenId === dto.destinoId)
      throw new BadRequestException('Elige dos cuentas diferentes');
    return transaccionCaja(this.prisma, async (tx) => {
      const origen = await this.cuentaAutorizada(tx, dto.origenId, actor, true);
      const destino = await this.cuentaAutorizada(tx, dto.destinoId, actor, true);
      const key = `transferencia:${dto.operacionId}`;
      const old = await tx.movimientoCaja.findUnique({
        where: { claveOperacion: `${key}:salida` },
      });
      if (old) {
        const entrada = await tx.movimientoCaja.findUnique({
          where: { claveOperacion: `${key}:entrada` },
        });
        if (old.cuentaId !== origen.id || entrada?.cuentaId !== destino.id)
          throw new ConflictException('La transferencia ya usa otras cuentas');
        if (
          !old.importe.equals(new Prisma.Decimal(dto.monto).negated()) ||
          !old.descripcion.startsWith(`${dto.motivo.trim()} · A `) ||
          (dto.fecha && old.fecha.getTime() !== new Date(dto.fecha).getTime())
        )
          throw new ConflictException('El identificador ya fue usado para otra transferencia');
        return { id: dto.operacionId };
      }
      const worker = await exigirTrabajadorId(tx, actor.userId);
      const fecha = this.fechaManual(
        dto.fecha,
        origen.fechaApertura! > destino.fechaApertura!
          ? origen.fechaApertura!
          : destino.fechaApertura!,
      );
      for (const [a, signo, tipo, suffix, otra] of [
        [origen, -1, 'TRANSFERENCIA_SALIDA', 'salida', destino],
        [destino, 1, 'TRANSFERENCIA_ENTRADA', 'entrada', origen],
      ] as const) {
        await tx.movimientoCaja.create({
          data: {
            cuentaId: a.id,
            importe: new Prisma.Decimal(dto.monto).mul(signo),
            fecha,
            tipo,
            trabajadorId: worker,
            descripcion:
              `${dto.motivo.trim()} · ${signo < 0 ? 'A' : 'De'} ${otra.unidadNegocio.nombre} / ${etiquetaMetodoPago(otra.metodoPago)}`.slice(
                0,
                500,
              ),
            claveOperacion: `${key}:${suffix}`,
          },
        });
        await tx.cuentaCaja.update({ where: { id: a.id }, data: { version: { increment: 1 } } });
      }
      return { id: dto.operacionId };
    });
  }

  async ajustar(id: string, dto: AjusteCajaDto, actor: AuthUser) {
    return transaccionCaja(this.prisma, async (tx) => {
      const account = await this.cuentaAutorizada(tx, id, actor, true);
      const key = `ajuste:${dto.operacionId}`;
      const descripcion = `${dto.motivo.trim()} · Saldo correcto: S/ ${dto.saldoNuevo.toFixed(2)}`;
      const old = await tx.movimientoCaja.findUnique({ where: { claveOperacion: key } });
      if (old) {
        if (old.cuentaId !== account.id)
          throw new ConflictException('El ajuste pertenece a otra cuenta');
        if (old.descripcion !== descripcion)
          throw new ConflictException('El identificador ya fue usado para otro ajuste');
        return { id: old.id.toString() };
      }
      if (account.version !== dto.version)
        throw new ConflictException('El saldo cambió. Actualiza la cuenta antes de ajustar.');
      const importe = new Prisma.Decimal(dto.saldoNuevo).minus(await this.saldo(tx, account));
      if (importe.isZero())
        throw new BadRequestException('El saldo ya coincide; no hace falta ajuste');
      const row = await tx.movimientoCaja.create({
        data: {
          cuentaId: account.id,
          importe,
          fecha: new Date(),
          tipo: 'AJUSTE',
          trabajadorId: await exigirTrabajadorId(tx, actor.userId),
          descripcion,
          claveOperacion: key,
        },
      });
      await tx.cuentaCaja.update({
        where: { id: account.id },
        data: { version: { increment: 1 } },
      });
      return { id: row.id.toString() };
    });
  }

  async movimientos(
    actor: AuthUser,
    query: {
      unidad?: string;
      from?: string;
      to?: string;
      cuentaId?: string;
      tipo?: string;
      pagina?: string;
    },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const scope = await resolverAlcanceUnidad(tx, actor, query.unidad);
        if (query.tipo && ![...TIPOS, 'APERTURA'].includes(query.tipo))
          throw new BadRequestException('Tipo de movimiento no válido');
        if (query.cuentaId && !/^[1-9]\d*$/.test(query.cuentaId))
          throw new BadRequestException('Cuenta no válida');
        const from = query.from ? day(query.from) : day(`${limaTodayKey().slice(0, 7)}-01`);
        const to = query.to ? day(query.to) : day(limaTodayKey());
        to.setUTCDate(to.getUTCDate() + 1);
        if (from >= to) throw new BadRequestException('El rango de fechas no es válido');
        const accounts = await tx.cuentaCaja.findMany({
          where: {
            ...filtroUnidad(scope),
            ...(query.cuentaId ? { id: BigInt(query.cuentaId) } : {}),
          },
          include,
        });
        const rows = await tx.movimientoCaja.findMany({
          where: { cuentaId: { in: accounts.map((a) => a.id) }, fecha: { lt: to } },
          orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
          include: { trabajador: true },
        });
        const accumulated = new Map(accounts.map((a) => [a.id, a.saldoInicial]));
        const filtered: any[] = [];
        let ingresos = new Prisma.Decimal(0),
          salidas = new Prisma.Decimal(0);
        const porCuenta = new Map<string, { ingresos: Prisma.Decimal; salidas: Prisma.Decimal }>();
        const byId = new Map(accounts.map((a) => [a.id, a]));
        for (const row of rows) {
          const account = byId.get(row.cuentaId)!;
          const initialized = account.fechaApertura && row.fecha >= account.fechaApertura;
          const previous = accumulated.get(row.cuentaId);
          const saldo = initialized && previous != null ? previous.plus(row.importe) : null;
          if (saldo != null) accumulated.set(row.cuentaId, saldo);
          if (row.fecha < from || (query.tipo && query.tipo !== row.tipo)) continue;
          if (row.importe.greaterThan(0)) ingresos = ingresos.plus(row.importe);
          else salidas = salidas.minus(row.importe);
          const totals = porCuenta.get(account.id.toString()) ?? {
            ingresos: new Prisma.Decimal(0),
            salidas: new Prisma.Decimal(0),
          };
          if (row.importe.greaterThan(0)) totals.ingresos = totals.ingresos.plus(row.importe);
          else totals.salidas = totals.salidas.minus(row.importe);
          porCuenta.set(account.id.toString(), totals);
          filtered.push({
            id: row.id.toString(),
            cuentaId: row.cuentaId.toString(),
            unidad: account.unidadNegocio.nombre,
            metodo: etiquetaMetodoPago(account.metodoPago),
            fecha: row.fecha,
            registradoAt: row.registradoAt,
            tipo: row.tipo,
            importe: row.importe.toNumber(),
            saldo: saldo?.toNumber() ?? null,
            descripcion: row.descripcion,
            responsable: row.trabajador
              ? `${row.trabajador.nombres} ${row.trabajador.apellidos}`
              : 'Sistema',
            origen: row.fuenteTipo,
            origenId: row.fuenteId?.toString() ?? null,
            ventaId: row.ventaId?.toString() ?? null,
          });
        }
        const gastos = await tx.gasto.findMany({
          where: {
            ...filtroUnidad(scope),
            estado: 'CONFIRMADO',
            metodoPagoId: null,
            fecha: {
              gte: new Date(`${from.toISOString().slice(0, 10)}T00:00:00Z`),
              lt: new Date(`${to.toISOString().slice(0, 10)}T00:00:00Z`),
            },
          },
          include: { categoria: true, unidadNegocio: true },
          orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        });
        const page = Math.max(1, Number(query.pagina ?? 1));
        if (!Number.isInteger(page)) throw new BadRequestException('La página no es válida');
        return {
          items: filtered.reverse().slice((page - 1) * 50, page * 50),
          total: filtered.length,
          pagina: page,
          ingresos: ingresos.toNumber(),
          salidas: salidas.toNumber(),
          porCuenta: Object.fromEntries(
            [...porCuenta].map(([id, total]) => [
              id,
              { ingresos: total.ingresos.toNumber(), salidas: total.salidas.toNumber() },
            ]),
          ),
          gastosSinCuenta: {
            monto: gastos.reduce((sum, g) => sum.plus(g.monto), new Prisma.Decimal(0)).toNumber(),
            cantidad: gastos.length,
            items: gastos.slice(0, 50).map((g) => ({
              id: g.id.toString(),
              fecha: g.fecha,
              monto: g.monto.toNumber(),
              concepto: g.concepto || g.categoria.nombre,
              unidad: g.unidadNegocio.nombre,
              origen: g.categoria.nombre === 'Gastos del día' ? 'Carga diaria' : 'Gastos',
            })),
          },
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
}
