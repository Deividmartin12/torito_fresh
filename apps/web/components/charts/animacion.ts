/**
 * Clases de entrada de los gráficos del panel y los reportes. Los `@keyframes` viven al final
 * de `app/globals.css`. `both` deja cada elemento en su estado inicial mientras espera su
 * retraso escalonado. Con "reducir movimiento" activado en el sistema no se anima nada.
 */
export const barraVertical =
  'origin-bottom animate-[crecer-y_700ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none';
export const barraHorizontal =
  'origin-left animate-[crecer-x_700ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none';
/** Líneas y trazos SVG: se descubren de izquierda a derecha. `backwards` para que al terminar
 *  no quede ningún recorte aplicado. */
export const trazoDibujado =
  'animate-[dibujar_1100ms_cubic-bezier(0.65,0,0.35,1)_backwards] motion-reduce:animate-none';
export const aparece = 'animate-[aparecer_500ms_ease-out_both] motion-reduce:animate-none';
export const entraGirando =
  'animate-[entrar-giro_800ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none';

/** Retraso escalonado: cada elemento entra un poco después del anterior, con un tope. */
export const retraso = (indice: number, paso = 35, tope = 700) => ({
  animationDelay: `${Math.min(indice * paso, tope)}ms`,
});

/**
 * Firma de los datos de un gráfico. Usada como `key`, vuelve a montar el gráfico cuando cambian
 * los datos (otro período, otro filtro) y así la animación se repite.
 */
export const firma = (valores: unknown[]) => JSON.stringify(valores);
