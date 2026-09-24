import { PrismaClient } from '@prisma/client';
import { AlcanceUnidad, filtroUnidad, filtroUnidadPor } from './unit-context';
import { accountState } from './receivables';
import { Transaction } from './stock';

/**
 * La situación crediticia de un cliente: lo que debe, lo que tiene vencido y cuánto le queda
 * de límite.
 *
 * Vive acá y no dentro de un servicio porque la miran tres lugares: la pantalla de clientes,
 * el combo de la venta y la validación que corre al guardar. Con el cálculo repetido en cada
 * uno, el aviso del formulario y el corte del servidor podían discrepar, que es la peor forma
 * de fallar: el vendedor ve luz verde y el guardado le dice que no.
 *
 * El "vencido" NO se recalcula acá: sale de `accountState`, que es la única definición de
 * VENCIDA del sistema.
 */
export type SituacionCredito = {
  /** Deuda vigente: suma de los saldos pendientes. */
  deuda: number;
  comprobantes: number;
  vencido: number;
  vencidas: number;
  /** Tope en soles. `null` = sin límite configurado. */
  limite: number | null;
  /** Cuánto más se le puede fiar hoy. `null` = sin límite. */
  disponible: number | null;
};

const vacia = (limite: number | null): SituacionCredito => ({
  deuda: 0,
  comprobantes: 0,
  vencido: 0,
  vencidas: 0,
  limite,
  disponible: limite,
});

/**
 * Situación de crédito de los clientes pedidos (o de todos los del alcance).
 *
 * @param excluirVentaId La cuenta de esta venta no cuenta como deuda. Hace falta al editar:
 *   una venta a crédito que se está reescribiendo se bloquearía a sí misma.
 */
export async function situacionDeCredito(
  db: Transaction | PrismaClient,
  opciones: {
    alcance?: AlcanceUnidad;
    clienteIds?: bigint[];
    excluirVentaId?: bigint;
  },
): Promise<Map<string, SituacionCredito>> {
  const { alcance, clienteIds, excluirVentaId } = opciones;
  const [clientes, cuentas] = await Promise.all([
    db.cliente.findMany({
      where: {
        ...(clienteIds ? { id: { in: clienteIds } } : {}),
        // `Cliente` lleva su propia columna de unidad; la cuenta por cobrar la hereda de él.
        ...(alcance ? filtroUnidad(alcance) : {}),
      },
      select: { id: true, limiteCredito: true },
    }),
    db.cuentaCobrar.findMany({
      where: {
        saldoPendiente: { gt: 0 },
        // Una venta anulada deja su cuenta en cero, así que no entra acá por sí sola; el
        // filtro de estado está igual para que un futuro flujo que deje saldo no la cuente.
        estado: { not: 'ANULADA' },
        ...(clienteIds ? { clienteId: { in: clienteIds } } : {}),
        ...(alcance ? filtroUnidadPor('cliente', alcance) : {}),
        ...(excluirVentaId ? { ventaId: { not: excluirVentaId } } : {}),
      },
      select: {
        clienteId: true,
        saldoPendiente: true,
        montoPagado: true,
        fechaVencimiento: true,
      },
    }),
  ]);

  const mapa = new Map<string, SituacionCredito>();
  for (const cliente of clientes) {
    mapa.set(
      cliente.id.toString(),
      vacia(cliente.limiteCredito === null ? null : Number(cliente.limiteCredito)),
    );
  }
  for (const cuenta of cuentas) {
    const clave = cuenta.clienteId.toString();
    // Un cliente que no vino en la lista de arriba (otro alcance) igual se acumula: así la
    // función sirve tanto para "todos los del alcance" como para ids sueltos.
    const fila = mapa.get(clave) ?? vacia(null);
    const saldo = Number(cuenta.saldoPendiente);
    fila.deuda += saldo;
    fila.comprobantes += 1;
    if (accountState(cuenta) === 'VENCIDA') {
      fila.vencido += saldo;
      fila.vencidas += 1;
    }
    mapa.set(clave, fila);
  }
  for (const fila of mapa.values()) {
    fila.deuda = redondear(fila.deuda);
    fila.vencido = redondear(fila.vencido);
    fila.disponible = fila.limite === null ? null : Math.max(redondear(fila.limite - fila.deuda), 0);
  }
  return mapa;
}

/**
 * El resultado de evaluar el crédito. Es un objeto plano y no una unión discriminada porque
 * el API compila con `strict: false`, y sin `strictNullChecks` TypeScript no estrecha por un
 * booleano: `if (v.ok) return` no convence al compilador de que después hay `mensaje`.
 */
export type VeredictoCredito = {
  ok: boolean;
  motivo?: 'VENCIDA' | 'LIMITE';
  /** Por qué no alcanza, listo para mostrar tal cual. Vacío cuando `ok` es true. */
  mensaje: string;
};

/**
 * Si a este cliente se le puede dejar a deber `saldoQueDeja`.
 *
 * Son dos reglas y el orden importa: primero la puntualidad, porque es la que explica mejor
 * qué tiene que pasar para destrabar la venta (que pague lo vencido), y después el tope.
 *
 * El mensaje sale armado para mostrarlo tal cual.
 *
 * OJO: la web tiene su espejo de estas reglas en `apps/web/lib/credito.ts`, para avisar
 * mientras se llena el formulario sin ir y volver al servidor por cada tecla. Si cambia una
 * regla acá, hay que cambiarla allá: si no, el vendedor ve luz verde y el guardado le dice
 * que no. Esta función es la que manda; la otra solo adelanta la respuesta.
 */
export function evaluarCredito(
  situacion: SituacionCredito | undefined,
  saldoQueDeja: number,
): VeredictoCredito {
  if (!situacion || saldoQueDeja <= 0.005) return { ok: true, mensaje: '' };

  if (situacion.vencidas > 0) {
    return {
      ok: false,
      motivo: 'VENCIDA',
      mensaje:
        `Este cliente tiene ${situacion.vencidas} ${situacion.vencidas === 1 ? 'cuenta vencida' : 'cuentas vencidas'} ` +
        `por ${soles(situacion.vencido)}. No se le puede vender a crédito hasta que las regularice.`,
    };
  }

  if (situacion.limite === null) return { ok: true, mensaje: '' };

  if (situacion.limite === 0) {
    return {
      ok: false,
      motivo: 'LIMITE',
      mensaje: 'A este cliente no se le vende a crédito: su límite está en cero.',
    };
  }

  const quedaria = redondear(situacion.deuda + saldoQueDeja);
  if (quedaria > situacion.limite + 0.005) {
    return {
      ok: false,
      motivo: 'LIMITE',
      mensaje:
        `Su límite es ${soles(situacion.limite)} y ya debe ${soles(situacion.deuda)}. ` +
        `Esta venta lo dejaría en ${soles(quedaria)}: se pasa por ${soles(quedaria - situacion.limite)}.`,
    };
  }
  return { ok: true, mensaje: '' };
}

const redondear = (valor: number) => Math.round(valor * 100) / 100;
const soles = (valor: number) => `S/ ${redondear(valor).toFixed(2)}`;
