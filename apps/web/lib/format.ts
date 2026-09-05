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

export function fechaHora(value: string | Date | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function fechaCorta(value: string | Date | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value));
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
