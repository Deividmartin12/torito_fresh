# Reportes de compras

## Contenido
- KPIs principales
- Gráficos recomendados
- Layout sugerido del dashboard de compras
- Tablas de detalle
- Trampas de cálculo

## KPIs principales

| KPI | Fórmula | Para qué sirve |
|---|---|---|
| Gasto total | Σ órdenes recibidas en el periodo (sin IGV) | Cifra base del área |
| Gasto por categoría | Gasto agrupado por familia de producto | Dónde se concentra el dinero |
| N.º de proveedores activos | Proveedores con ≥ 1 compra | Diversificación |
| Concentración de proveedores | % del gasto en los 3 mayores | Riesgo de dependencia |
| Lead time promedio | Σ (fecha recepción − fecha orden) ÷ n.º órdenes | Cuánto tarda reponer, insumo del stock mínimo |
| Variabilidad del lead time | Desviación estándar del lead time | Más importante que el promedio para el stock de seguridad |
| % Entregas a tiempo | Órdenes recibidas ≤ fecha prometida ÷ total | Cumplimiento del proveedor |
| OTIF | Órdenes a tiempo **y** completas ÷ total | Métrica dura de servicio del proveedor |
| Variación de precio unitario | (Precio actual − precio anterior) ÷ precio anterior | Detecta alzas silenciosas |
| Órdenes pendientes | Órdenes emitidas sin recepción total | Lo que está por llegar (y lo atrasado) |
| Precio promedio ponderado por SKU | Σ (precio × cantidad) ÷ Σ cantidad | Comparable entre proveedores |

Set recomendado para la fila superior: gasto total, n.º de órdenes, lead time promedio, % OTIF, órdenes atrasadas.

## Gráficos recomendados

1. **Pareto de gasto por proveedor** — barras descendentes + línea de % acumulado. Es el gráfico estrella del
   área: muestra en segundos con quién se juega el presupuesto y dónde negociar.
2. **Gasto por categoría en el tiempo** — barras apiladas por mes; delata categorías que crecen sin que nadie lo
   note.
3. **Evolución del precio unitario por SKU** — línea con una serie por proveedor. Un SKU a la vez, seleccionable.
   Marcar la fecha de cada cambio de precio con un punto.
4. **Lead time por proveedor** — barras horizontales del promedio con barra de error o rango mín-máx. Un
   proveedor lento pero constante es mejor que uno rápido e impredecible, y el gráfico debe dejarlo ver.
5. **OTIF por proveedor** — barras horizontales con línea de meta (típicamente 95 %) y color semántico por tramo.
6. **Órdenes pendientes por antigüedad** — barras apiladas: por llegar / vence hoy / atrasada 1-7 días / atrasada
   +7 días. Es el gráfico que dispara acciones inmediatas.
7. **Dispersión precio vs. volumen por proveedor** — revela si se está comprando caro en volumen alto, que es
   donde está el ahorro.

## Layout sugerido

```
[ KPIs: gasto total | n.º órdenes | lead time prom. | OTIF | órdenes atrasadas ]
[ Gasto mensual por categoría (barras apiladas) — ancho completo               ]
[ Pareto de gasto por proveedor  ][ OTIF por proveedor con meta                ]
[ Lead time por proveedor        ][ Órdenes pendientes por antigüedad          ]
[ Tabla de órdenes de compra (con estado de recepción)                          ]
```

Para seguimiento de precios conviene una **segunda pestaña o vista** dedicada: selector de SKU + línea histórica
de precio + tabla de últimas compras con proveedor, cantidad y precio unitario.

## Tablas de detalle

- **Órdenes de compra**: número, fecha de emisión, proveedor, fecha prometida, fecha de recepción, días de
  atraso, monto, % recibido, estado.
- **Detalle por ítem**: SKU, descripción, cantidad pedida, recibida, pendiente, precio unitario, variación vs.
  última compra.
- Resaltar con color y etiqueta las filas atrasadas y las recepciones parciales; son las que requieren acción.

## Trampas de cálculo

- **Fecha de orden vs. fecha de recepción**: el gasto se reconoce en la recepción, no en la emisión. Elegir una
  base, declararla y no mezclarla entre bloques del mismo reporte.
- **Recepciones parciales**: una orden con dos entregas tiene dos lead times. Calcular por línea de recepción o
  definir que cuenta la recepción total.
- **Proveedores duplicados**: el mismo proveedor cargado dos veces con RUC igual y nombre distinto rompe todo
  ranking. Agrupar por RUC/identificador fiscal, no por nombre.
- **Comparar precios de unidades distintas**: caja de 12 vs. unidad. Normalizar a la unidad base antes de
  comparar precios.
- **Flete, aduanas y descuentos por volumen**: si no se prorratean al costo del ítem, el precio unitario miente y
  el margen de ventas también.
- **Compras en moneda extranjera**: usar el tipo de cambio de la fecha del documento; recalcular el histórico con
  el tipo de cambio de hoy inventa variaciones de precio que nunca ocurrieron.
