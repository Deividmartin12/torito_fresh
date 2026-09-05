# Reportes de almacén e inventario

## Contenido
- KPIs principales
- Gráficos recomendados
- Layout sugerido del dashboard de almacén
- Clasificación ABC / XYZ
- Tablas de detalle
- Trampas de cálculo

## KPIs principales

| KPI | Fórmula | Para qué sirve |
|---|---|---|
| Valor de inventario | Σ (stock × costo unitario) | Capital inmovilizado |
| Rotación | Costo de ventas del periodo ÷ inventario promedio | Cuántas veces se renueva el stock |
| Días de inventario (DSI) | 365 ÷ rotación anual | La misma idea, en días, más fácil de leer |
| Cobertura por SKU | Stock actual ÷ consumo promedio diario | Cuántos días aguanta cada ítem |
| SKUs bajo mínimo | Conteo con stock ≤ punto de reorden | Lista de reposición inmediata |
| SKUs en quiebre | Conteo con stock = 0 y demanda activa | Venta perdida en curso |
| Tasa de quiebre | SKUs en quiebre ÷ SKUs activos | Nivel de servicio del almacén |
| Inventario sin movimiento | Valor de SKUs sin salida en 90/180 días | Plata dormida, candidata a liquidación |
| Exactitud de inventario | Ítems con conteo correcto ÷ ítems contados | Confiabilidad del sistema vs. el físico |
| Merma | (Stock teórico − físico) valorizado | Pérdida, robo o error de registro |

Set recomendado para la fila superior: valor de inventario, rotación (o DSI), SKUs bajo mínimo, SKUs en quiebre,
valor sin movimiento.

## Gráficos recomendados

1. **Antigüedad del inventario (aging)** — barras apiladas por tramos 0-30 / 31-60 / 61-90 / +90 días, en valor
   monetario, no en unidades: lo que importa es la plata detenida. Segmentable por categoría o almacén.
2. **Valor de inventario en el tiempo** — línea, idealmente con la línea de venta encima para ver si el stock
   crece más rápido que la demanda.
3. **Días de cobertura por SKU** — barras horizontales con dos líneas de referencia: mínimo (riesgo de quiebre) y
   máximo (sobrestock). Mostrar solo los extremos, no los 3000 SKUs: top 15 en riesgo y top 15 en exceso.
4. **Dispersión ABC** — eje X: rotación anual; eje Y: valor de stock; tamaño del punto: consumo. Los cuatro
   cuadrantes se leen solos: mucho valor y poca rotación es el problema a atacar.
5. **Nivel de stock de un SKU** — línea temporal con banda sombreada entre stock mínimo y máximo, y marcas de
   recepciones. Es la vista de diagnóstico para discutir un ítem puntual.
6. **Distribución de valor por almacén / ubicación** — barras horizontales; torta solo si son 3-4 almacenes.
7. **Exactitud por conteo cíclico** — línea de % de exactitud por mes con meta (típicamente 95-98 %).
8. **Entradas vs. salidas por periodo** — barras agrupadas o barras divergentes (entradas hacia arriba, salidas
   hacia abajo); muestra el desbalance que explica el crecimiento del stock.

## Layout sugerido

```
[ KPIs: valor inventario | rotación | SKUs bajo mínimo | quiebres | valor sin movimiento ]
[ Valor de inventario vs. ventas en el tiempo — ancho completo                           ]
[ Aging del inventario (apilado)   ][ Dispersión ABC (valor vs. rotación)                ]
[ Top SKUs en riesgo de quiebre    ][ Top SKUs con sobrestock                            ]
[ Tabla de stock por SKU y almacén (con semáforo de estado)                              ]
```

La tabla de reposición (bajo mínimo + sugerido a pedir) suele ser el bloque más usado del reporte: dejarla
accesible y exportable, y ordenarla por urgencia (días de cobertura ascendente), no por código.

## Clasificación ABC / XYZ

- **ABC** por valor de consumo anual: A ≈ 80 % del valor (≈ 20 % de los SKUs), B ≈ 15 %, C ≈ 5 %.
- **XYZ** por variabilidad de la demanda: X estable, Y con estacionalidad, Z errática.
- La matriz combinada dirige la política: AX se controla con stock ajustado y revisión frecuente; CZ no merece
  seguimiento fino. Mostrarla como matriz 3×3 con conteo y valor en cada celda.

## Tablas de detalle

- **Stock por SKU**: código, descripción, almacén, unidad, stock, comprometido, disponible, mínimo, cobertura en
  días, costo unitario, valor, estado (semáforo).
- **Kardex de un SKU**: fecha, tipo de movimiento, documento, entrada, salida, saldo, costo unitario, saldo
  valorizado. Debe cuadrar línea a línea con el saldo final; si no cuadra, no publicar el reporte.
- **Reposición sugerida**: SKU, cobertura, consumo diario, lead time del proveedor, punto de reorden, cantidad
  sugerida.

## Trampas de cálculo

- **Stock disponible ≠ stock físico**: restar lo comprometido en pedidos o reservas antes de declarar un quiebre.
- **Inventario promedio**: para rotación usar (inicial + final) ÷ 2 o el promedio de saldos diarios; usar solo el
  saldo final distorsiona los meses con compras grandes al cierre.
- **Rotación con periodos cortos**: calcularla sobre un mes y anualizarla exagera la estacionalidad. Indicar la
  base del cálculo en el reporte.
- **Cobertura de SKUs sin consumo**: la división por cero da infinito; mostrar "sin consumo" y clasificarlos como
  inventario muerto, que es lo que son.
- **SKUs nuevos**: no marcarlos como sin movimiento hasta que cumplan el periodo de análisis.
- **Costo unitario cambiante**: valorizar cada saldo con el costo vigente en su fecha según el método declarado
  (promedio ponderado o PEPS), no con el costo de hoy aplicado a todo el histórico.
- **Multi-almacén**: un mismo SKU con stock alto en una sede y quiebre en otra se ve sano en el total. Los
  quiebres se calculan por almacén y luego se consolidan.
- **Unidades de medida**: no sumar cajas con unidades; convertir a la unidad base antes de agregar.
