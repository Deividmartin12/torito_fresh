/**
 * Carga varios catálogos a la vez sin que uno arrastre a los demás.
 *
 * `Promise.all` es todo o nada: si una sola petición falla, todas las listas quedan vacías y
 * la pantalla aparece inservible sin explicar por qué. Eso era exactamente lo que pasaba en
 * Gastos: un 403 en cualquiera de las cinco cargas dejaba el formulario sin categorías y con
 * el botón de guardar apagado, culpando a una categoría que sí existía.
 *
 * Acá cada petición falla sola: las que respondieron se usan, y las que no dejan su error
 * para que la pantalla pueda ofrecer "Reintentar" en vez de mentir.
 *
 *   const [gastos, categorias] = await cargarParcial([getExpenses(), getCategorias()]);
 *   if (categorias.error) ...
 */

export type Cargado<T> = { valor: T | null; error: Error | null };

export async function cargarParcial<T extends readonly unknown[]>(promesas: {
  [K in keyof T]: Promise<T[K]>;
}): Promise<{ [K in keyof T]: Cargado<T[K]> }> {
  const resultados = await Promise.allSettled(promesas as readonly Promise<unknown>[]);
  return resultados.map((resultado) =>
    resultado.status === 'fulfilled'
      ? { valor: resultado.value, error: null }
      : {
          valor: null,
          error:
            resultado.reason instanceof Error
              ? resultado.reason
              : new Error('No se pudo cargar la información'),
        },
  ) as { [K in keyof T]: Cargado<T[K]> };
}

/** El primer error real de una carga parcial, para mostrar un solo aviso y no cinco. */
export function primerError(...cargas: Cargado<unknown>[]): Error | null {
  return cargas.find((carga) => carga.error)?.error ?? null;
}
