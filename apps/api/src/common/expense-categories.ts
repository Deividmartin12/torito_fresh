/**
 * Categoría de gasto fija del sistema.
 *
 * Un gasto de esta categoría es la remuneración de un trabajador, y por eso es la única
 * que exige un beneficiario (`Gasto.beneficiarioId`). Ese enlace es lo que hace que el
 * pago aparezca después en el reporte del trabajador.
 *
 * El nombre está congelado a propósito: la fila se crea en la migración con
 * `sistema = true` y `ExpensesService` bloquea renombrarla o eliminarla, para que la regla
 * "esta categoría pide trabajador" no se rompa al editar el catálogo.
 */
export const CATEGORIA_PAGO_TRABAJADOR = 'Pago a trabajador';

/**
 * Categoría fija de los gastos cargados como total del día desde la carga diaria. La crea
 * esa pantalla la primera vez que hace falta, con `sistema = true`.
 */
export const CATEGORIA_GASTOS_DEL_DIA = 'Gastos del día';

export function esPagoTrabajador(categoria: string): boolean {
  return categoria.trim().toLocaleLowerCase('es') === CATEGORIA_PAGO_TRABAJADOR.toLowerCase();
}
