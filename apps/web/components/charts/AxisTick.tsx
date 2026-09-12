/**
 * Marcas del eje X compartidas por los gráficos con eje de tiempo.
 *
 * Cada marca puede tener dos líneas: `labelTop` es el texto de contexto (el nombre del día, el
 * número de semana, el año) y `label` el dato corto que siempre se ve. Cuando la tarjeta del
 * gráfico se hace angosta, el CSS esconde `.chart-tick-top` y queda solo la fecha.
 */

/** Marca dentro de un SVG. Cada línea lleva su `y` absoluto para que esconder la de arriba no
 *  mueva la de abajo. */
export function AxisTick({
  x,
  y,
  label,
  labelTop,
}: {
  x: number;
  y: number;
  label: string;
  labelTop?: string;
}) {
  return (
    <text className="chart-date-label" textAnchor="middle">
      {labelTop ? (
        <tspan className="chart-tick-top" x={x} y={y - 12}>
          {labelTop}
        </tspan>
      ) : null}
      <tspan x={x} y={y}>
        {label}
      </tspan>
    </text>
  );
}

/** Marca debajo de una columna del gráfico de barras (HTML, no SVG). */
export function ColumnTick({ label, labelTop }: { label: string; labelTop?: string }) {
  return (
    <small>
      {labelTop ? <span className="chart-tick-top">{labelTop}</span> : null}
      {label}
    </small>
  );
}

/**
 * Cada cuántas marcas se escribe una etiqueta: con pocas (día, semana, mes, año) se muestran
 * todas, y recién con muchas —un rango personalizado de varias semanas— se saltean para que no
 * se encimen.
 */
export const tickEvery = (count: number, all = 12) =>
  count <= all ? 1 : Math.max(1, Math.ceil(count / 6));
