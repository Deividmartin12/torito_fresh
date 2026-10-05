import { ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Transaction } from './stock';

export async function transaccionCaja<T>(
  db: PrismaClient,
  action: (tx: Transaction) => Promise<T>,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await db.$transaction(action, { isolationLevel: 'Serializable', timeout: 30000 });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2034') throw e;
      if (i === 3)
        throw new ConflictException('Otra operación está actualizando la caja. Vuelve a guardar.');
    }
  }
}

export function cuentaCaja(tx: Transaction, unidadNegocioId: bigint, metodoPagoId: bigint) {
  return tx.cuentaCaja.upsert({
    where: { unidadNegocioId_metodoPagoId: { unidadNegocioId, metodoPagoId } },
    create: { unidadNegocioId, metodoPagoId },
    update: {},
  });
}

type Fuente = {
  unidadNegocioId: bigint;
  metodoPagoId: bigint;
  importe: Prisma.Decimal;
  fecha: Date;
  tipo: string;
  descripcion: string;
  trabajadorId: bigint | null;
  ventaId?: bigint;
};

/** Reconciliar una fuente es idempotente. Nunca borra asientos, ni depende de que su cobro siga existiendo. */
async function sincronizarFuente(
  tx: Transaction,
  fuenteTipo: string,
  fuenteId: bigint,
  nueva: Fuente | null,
) {
  const previos = await tx.movimientoCaja.findMany({
    where: { fuenteTipo, fuenteId },
    orderBy: { id: 'asc' },
  });
  const cuenta = nueva ? await cuentaCaja(tx, nueva.unidadNegocioId, nueva.metodoPagoId) : null;
  const netos = new Map<string, { row: (typeof previos)[number]; importe: Prisma.Decimal }>();
  for (const row of previos) {
    const key = `${row.cuentaId}:${row.fecha.toISOString()}`;
    const entry = netos.get(key) ?? { row, importe: new Prisma.Decimal(0) };
    entry.importe = entry.importe.plus(row.importe);
    netos.set(key, entry);
  }
  const activos = [...netos.values()].filter((n) => !n.importe.isZero());
  if (!nueva && !activos.length) return;
  if (
    nueva &&
    activos.length === 1 &&
    activos[0].row.cuentaId === cuenta!.id &&
    activos[0].row.fecha.getTime() === nueva.fecha.getTime() &&
    activos[0].importe.equals(nueva.importe)
  )
    return;
  const touched = new Set<bigint>();
  for (const { row, importe } of activos) {
    await tx.movimientoCaja.create({
      data: {
        cuentaId: row.cuentaId,
        importe: importe.negated(),
        fecha: row.fecha,
        tipo: 'REVERSION',
        fuenteTipo,
        fuenteId,
        ventaId: row.ventaId,
        trabajadorId: nueva?.trabajadorId ?? row.trabajadorId,
        descripcion: `Reversión de ${row.descripcion}`.slice(0, 500),
      },
    });
    touched.add(row.cuentaId);
  }
  if (nueva && !nueva.importe.isZero()) {
    const { unidadNegocioId, metodoPagoId, ...data } = nueva;
    await tx.movimientoCaja.create({
      data: { ...data, cuentaId: cuenta!.id, fuenteTipo, fuenteId },
    });
    touched.add(cuenta!.id);
  }
  for (const id of touched)
    await tx.cuentaCaja.update({ where: { id }, data: { version: { increment: 1 } } });
}

export async function sincronizarPagoCaja(tx: Transaction, id: bigint) {
  const pago = await tx.pagoCliente.findUnique({
    where: { id },
    include: { cuentaCobrar: { include: { venta: true } } },
  });
  await sincronizarFuente(
    tx,
    'PAGO',
    id,
    pago?.estado === 'CONFIRMADO'
      ? {
          unidadNegocioId: pago.cuentaCobrar.venta.unidadNegocioId,
          metodoPagoId: pago.metodoPagoId,
          importe: pago.monto,
          // El formulario antiguo guardaba fechas de cobranza sin hora como medianoche UTC.
          // Para Caja representan ese día calendario en Lima; se conserva la fuente original.
          fecha:
            pago.origen === 'COBRANZA' && pago.fechaPago.toISOString().endsWith('T00:00:00.000Z')
              ? new Date(`${pago.fechaPago.toISOString().slice(0, 10)}T12:00:00-05:00`)
              : pago.fechaPago,
          trabajadorId: pago.trabajadorId,
          ventaId: pago.cuentaCobrar.ventaId,
          tipo: pago.origen === 'REEMBOLSO' ? 'REEMBOLSO' : 'COBRO',
          descripcion: `${pago.origen === 'REEMBOLSO' ? 'Reembolso' : pago.origen === 'VENTA' ? 'Cobro inicial' : 'Cobranza'} de venta V-${pago.cuentaCobrar.ventaId.toString().padStart(6, '0')}`,
        }
      : null,
  );
}

export async function revertirPagoCaja(tx: Transaction, id: bigint) {
  await sincronizarFuente(tx, 'PAGO', id, null);
}

export async function sincronizarGastoCaja(tx: Transaction, id: bigint) {
  const gasto = await tx.gasto.findUnique({ where: { id }, include: { categoria: true } });
  await sincronizarFuente(
    tx,
    'GASTO',
    id,
    gasto?.estado === 'CONFIRMADO' && gasto.metodoPagoId
      ? {
          unidadNegocioId: gasto.unidadNegocioId,
          metodoPagoId: gasto.metodoPagoId,
          importe: gasto.monto.negated(),
          fecha: new Date(`${gasto.fecha.toISOString().slice(0, 10)}T00:00:00-05:00`),
          trabajadorId: gasto.trabajadorId,
          tipo: 'GASTO',
          descripcion: `Gasto: ${gasto.concepto || gasto.categoria.nombre}`,
        }
      : null,
  );
}
