/**
 * Utilidades compartidas para el estado de una cuenta por cobrar/pagar.
 *
 * El estado "VENCIDA" no se persiste: se deriva al momento de leer comparando
 * la fecha de vencimiento con el día actual en la zona horaria de Lima. Estas
 * funciones concentran esa lógica para que el módulo de operaciones y el de
 * clientes reporten exactamente lo mismo.
 */

export type AccountRow = {
  saldoPendiente: unknown;
  montoPagado: unknown;
  fechaVencimiento: Date | string | null;
};

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria de Lima. */
export function limaTodayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Días entre hoy (Lima) y la fecha dada. Negativo = ya pasó. */
export function daysUntil(date: Date | string | null): number | null {
  if (!date) return null;
  const dueKey = (typeof date === 'string' ? date : date.toISOString()).slice(0, 10);
  const start = new Date(`${limaTodayKey()}T00:00:00.000Z`).getTime();
  const end = new Date(`${dueKey}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function isOverdue(row: AccountRow): boolean {
  if (Number(row.saldoPendiente) <= 0) return false;
  const days = daysUntil(row.fechaVencimiento);
  return days !== null && days < 0;
}

/** Estado derivado: PAGADA | VENCIDA | PARCIAL | PENDIENTE. */
export function accountState(row: AccountRow): 'PAGADA' | 'VENCIDA' | 'PARCIAL' | 'PENDIENTE' {
  if (Number(row.saldoPendiente) <= 0) return 'PAGADA';
  if (isOverdue(row)) return 'VENCIDA';
  return Number(row.montoPagado) > 0 ? 'PARCIAL' : 'PENDIENTE';
}
