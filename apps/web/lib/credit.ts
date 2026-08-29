/**
 * Textos y ayudas del flujo de créditos, en un solo lugar para que todas las
 * pantallas (venta a crédito, cobranzas, detalle de venta, clientes) hablen
 * igual y nunca muestren códigos crudos como "CREDITO" o "PENDIENTE".
 */

export type FormaPago = 'CONTADO' | 'CREDITO' | 'MIXTO';

/** Etiqueta corta de la forma de pago. */
export const formaPagoLabel: Record<string, string> = {
  CONTADO: 'Pago completo',
  CREDITO: 'A crédito',
  MIXTO: 'Pago parcial + crédito',
};

/**
 * Opciones para el selector de forma de pago. El texto sirve tanto para ventas
 * (cobrar al cliente) como para compras (pagar al proveedor).
 */
export const formaPagoOpciones: {
  value: FormaPago;
  titulo: string;
  detalle: string;
}[] = [
  {
    value: 'CONTADO',
    titulo: 'Pago completo ahora',
    detalle: 'Se paga el total en este momento.',
  },
  {
    value: 'CREDITO',
    titulo: 'A crédito',
    detalle: 'El total queda pendiente hasta la fecha acordada.',
  },
  {
    value: 'MIXTO',
    titulo: 'Pago parcial + saldo a crédito',
    detalle: 'Se abona una parte ahora y el resto queda a crédito.',
  },
];

/** Estado de una cuenta por cobrar / pagar. */
export const estadoCuentaLabel: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  PARCIAL: 'Pago parcial',
  PAGADA: 'Pagada',
  VENCIDA: 'Vencida',
  POR_VENCER: 'Por vencer',
  SIN_FECHA: 'Sin fecha programada',
};

/** Estado de pago de una venta. */
export const estadoPagoLabel: Record<string, string> = {
  PENDIENTE: 'Sin pagos',
  PARCIAL: 'Pago parcial',
  PAGADA: 'Pagada',
};

/** Días entre hoy y una fecha (YYYY-MM-DD o ISO). Negativo = ya pasó. */
export function daysToDue(value: string | null | undefined): number | null {
  if (!value) return null;
  const now = new Date();
  const todayKey = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  const start = new Date(`${todayKey}T00:00:00.000Z`).getTime();
  const end = new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

const plural = (n: number, one: string, many: string) => (Math.abs(n) === 1 ? one : many);

/**
 * Frase legible del vencimiento de una cuenta con saldo, p. ej.
 * "Vence hoy", "Vence en 5 días", "Vencida hace 3 días", "Sin fecha programada".
 */
export function resumenVencimiento(
  vencimiento: string | null | undefined,
  saldo: number,
): { label: string; tone: 'paid' | 'overdue' | 'today' | 'soon' | 'scheduled' | 'undated' } {
  if (saldo <= 0) return { label: 'Pagada', tone: 'paid' };
  const days = daysToDue(vencimiento);
  if (days === null) return { label: 'Sin fecha programada', tone: 'undated' };
  if (days < 0)
    return {
      label: `Vencida hace ${Math.abs(days)} ${plural(days, 'día', 'días')}`,
      tone: 'overdue',
    };
  if (days === 0) return { label: 'Vence hoy', tone: 'today' };
  if (days <= 7) return { label: `Vence en ${days} ${plural(days, 'día', 'días')}`, tone: 'soon' };
  return { label: `Vence en ${days} días`, tone: 'scheduled' };
}
