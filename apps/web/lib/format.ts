export function moneda(value: unknown) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function cantidad(value: unknown) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(amount);
}

/**
 * Normaliza un texto para compararlo en una búsqueda: saca acentos y diacríticos, pasa a
 * minúsculas y recorta los espacios. Así "Almacén" matchea "almacen" y viceversa.
 */
export function normalizarBusqueda(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Fecha y hora en formato dd/mm/aaaa hh:mm. */
export function fechaHora(value: string | Date | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

/**
 * Fecha en formato dd/mm/aaaa.
 *
 * Cuando el valor es una fecha de calendario —"2026-09-05" o "2026-09-05T00:00:00.000Z",
 * que es como Prisma serializa una columna `Date`— se usan esos dígitos tal cual, así la
 * zona horaria del navegador no corre el día (p. ej. un vencimiento del 05 no se ve como 04).
 * Para un instante con hora real se formatea en la zona local.
 */
export function fechaCorta(value: string | Date | null | undefined) {
  if (!value) return '-';
  if (typeof value === 'string') {
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/.exec(value);
    if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`;
  }
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export type Variacion = { texto: string; direccion: 'up' | 'down' | 'flat' | 'na' };

/**
 * Variación porcentual de un KPI contra el período comparativo. Un período anterior en cero
 * no puede dividir: se muestra "nuevo" si ahora hay valor, o "—" si ambos son cero, en vez de
 * un ∞ o un 0 % engañoso.
 */
export function variacion(actual: number, anterior: number): Variacion {
  if (!anterior)
    return actual ? { texto: 'nuevo', direccion: 'up' } : { texto: '—', direccion: 'na' };
  const pct = ((actual - anterior) / anterior) * 100;
  if (pct === 0) return { texto: '0.0%', direccion: 'flat' };
  return { texto: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, direccion: pct > 0 ? 'up' : 'down' };
}
