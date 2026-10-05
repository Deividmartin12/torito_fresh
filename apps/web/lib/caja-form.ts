/** Importes del formulario: no acepta separadores de miles ni redondea decimales extra. */
export function parseCajaAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || Math.abs(value) > 9_999_999_999.99) return null;
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

export function sumarCaja(saldo: number, importe: number) {
  return (Math.round(saldo * 100) + Math.round(importe * 100)) / 100;
}

export function fechaLimaInput(value = new Date(), withTime = false) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return withTime ? `${date}T${get('hour')}:${get('minute')}` : date;
}

export function fechaCajaManual(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00-05:00`);
  return Number.isNaN(date.getTime()) || fechaLimaInput(date, true) !== value
    ? null
    : date.toISOString();
}

export const fechaHoraCaja = (value: string | number) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

/** Un reintento idéntico conserva su UUID; cambiar el envío necesita una identidad nueva. */
export function identidadCaja(
  previous: { fingerprint: string; id: string } | null,
  path: string,
  body: object,
  newId: () => string,
) {
  const fingerprint = JSON.stringify({ path, body });
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, id: newId() };
}
