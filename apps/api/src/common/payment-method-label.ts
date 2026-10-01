/**
 * Nombre visible de un método de cobro, armado siempre acá para que la venta, el gasto,
 * la pantalla de administración y los reportes muestren exactamente lo mismo.
 *
 * Un método es una categoría (YAPE) más una referencia (el número).
 * Ejemplos: `EFECTIVO`, `YAPE · 953323112`.
 */
export function etiquetaMetodoPago(metodo: {
  referencia: string | null;
  categoria: { nombre: string } | null;
}): string {
  const base = metodo.categoria?.nombre || 'Método de pago';
  const referencia = metodo.referencia?.trim();
  return referencia ? `${base} · ${referencia}` : base;
}
