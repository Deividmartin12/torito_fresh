import { CatalogItem } from './operations';
import { moneda } from './format';

/**
 * Si a este cliente se le puede dejar a deber `saldoQueDeja`, y si no, por qué.
 *
 * Es el espejo de `evaluarCredito` en `apps/api/src/common/credit.ts`, con las mismas dos
 * reglas y en el mismo orden. Está duplicado a propósito: sirve para avisar mientras se llena
 * el formulario, sin una ida y vuelta al servidor por cada tecla. El servidor sigue siendo el
 * que decide —nadie confía en una validación del navegador—, pero los textos coinciden para
 * que la persona no lea una cosa antes de guardar y otra distinta al guardar.
 *
 * Si cambia una regla, hay que cambiar las dos. El comentario está en los dos archivos.
 */
export function evaluarCredito(cliente: CatalogItem | undefined, saldoQueDeja: number) {
  if (!cliente || saldoQueDeja <= 0.005) return null;

  const vencidas = cliente.vencidas ?? 0;
  if (vencidas > 0) {
    return (
      `Este cliente tiene ${vencidas} ${vencidas === 1 ? 'cuenta vencida' : 'cuentas vencidas'} ` +
      `por ${moneda(cliente.vencido ?? 0)}. No se le puede vender a crédito hasta que las regularice.`
    );
  }

  const limite = cliente.limiteCredito;
  if (limite === null || limite === undefined) return null;
  if (limite === 0) return 'A este cliente no se le vende a crédito: su límite está en cero.';

  const deuda = cliente.deudaActual ?? 0;
  const quedaria = Math.round((deuda + saldoQueDeja) * 100) / 100;
  if (quedaria > limite + 0.005) {
    return (
      `Su límite es ${moneda(limite)} y ya debe ${moneda(deuda)}. ` +
      `Esta venta lo dejaría en ${moneda(quedaria)}: se pasa por ${moneda(quedaria - limite)}.`
    );
  }
  return null;
}

/** Resumen corto del crédito del cliente, para mostrarlo junto al selector. */
export function resumenCredito(cliente: CatalogItem | undefined) {
  if (!cliente) return null;
  const deuda = cliente.deudaActual ?? 0;
  const limite = cliente.limiteCredito;
  const vencidas = cliente.vencidas ?? 0;
  if (deuda === 0 && (limite === null || limite === undefined)) return null;

  const partes = [`Debe ${moneda(deuda)}`];
  if (limite !== null && limite !== undefined) partes.push(`de un tope de ${moneda(limite)}`);
  if (vencidas > 0)
    partes.push(`· ${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'} por ${moneda(cliente.vencido ?? 0)}`);
  return { texto: partes.join(' '), alerta: vencidas > 0 || cliente.creditoDisponible === 0 };
}
