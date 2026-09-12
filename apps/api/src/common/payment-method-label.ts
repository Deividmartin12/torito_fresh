/**
 * Nombre visible de un método de cobro, armado siempre acá para que la venta, el gasto,
 * la pantalla de administración y los reportes muestren exactamente lo mismo.
 *
 * Un método es una categoría (YAPE) más una referencia (el número). El `nombre` propio es
 * una etiqueta libre opcional para casos como "Yape del negocio"; si no está, manda la
 * categoría. Ejemplos: `EFECTIVO`, `YAPE · 953323112`, `Yape del negocio · 953323112`.
 */
export function etiquetaMetodoPago(metodo: {
  nombre: string | null;
  referencia: string | null;
  categoria: { nombre: string } | null;
}): string {
  const base = metodo.nombre?.trim() || metodo.categoria?.nombre || 'Método de pago';
  const referencia = metodo.referencia?.trim();
  return referencia ? `${base} · ${referencia}` : base;
}
