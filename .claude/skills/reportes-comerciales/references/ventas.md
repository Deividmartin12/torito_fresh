# Reportes de ventas

## Contenido
- KPIs principales
- Gráficos recomendados
- Layout sugerido del dashboard de ventas
- Tablas de detalle
- Trampas de cálculo

## KPIs principales

| KPI | Fórmula | Para qué sirve |
|---|---|---|
| Venta neta | Venta bruta − devoluciones − descuentos (sin IGV) | Cifra oficial de ingresos |
| Unidades vendidas | Σ cantidad de líneas válidas | Detecta si el crecimiento es por precio o por volumen |
| Ticket promedio | Venta neta ÷ n.º de comprobantes | Salud del mix y del upselling |
| Ítems por ticket | Unidades ÷ n.º de comprobantes | Complemento del ticket promedio |
| Margen bruto | Venta neta − costo de ventas | Lo que realmente queda |
| % Margen | Margen bruto ÷ venta neta | Comparable entre categorías |
| Crecimiento MoM / YoY | (Actual − anterior) ÷ anterior | Contexto obligatorio de toda cifra |
| Cumplimiento de meta | Venta neta ÷ meta del periodo | Solo si existe meta cargada |
| Clientes activos | Clientes con ≥ 1 compra en el periodo | Base del análisis nuevos vs. recurrentes |
| Tasa de devolución | Devoluciones ÷ venta bruta | Alerta de calidad o de error de venta |

Elegir 4-6 para la fila superior. Un set que funciona casi siempre: venta neta, margen %, ticket promedio,
unidades, cumplimiento de meta.

## Gráficos recomendados

1. **Tendencia de venta neta** — línea, con serie punteada del periodo comparativo (mes anterior o año anterior).
   Granularidad: día si el rango ≤ 62 días, semana si ≤ 6 meses, mes si es mayor.
2. **Venta y margen combinados** — barras de venta + línea de % margen en eje secundario. Este es uno de los
   pocos casos donde el doble eje se justifica, porque son unidades distintas de la misma historia.
3. **Top 10 productos** — barras horizontales ordenadas. Ofrecer alternar entre orden por ingreso, por unidades
   y por margen: el top por ingreso y el top por margen casi nunca coinciden, y esa diferencia es el hallazgo.
4. **Pareto de clientes** — barras de venta por cliente + línea de % acumulado, para ver concentración y riesgo.
5. **Participación por canal / sucursal / vendedor** — barras apiladas al 100 % en el tiempo, para ver si el mix
   se está moviendo. Una torta solo muestra el hoy y pierde la tendencia.
6. **Meta vs. real por vendedor o sucursal** — barras horizontales con línea de meta y % de cumplimiento a la
   derecha de cada barra.
7. **Mapa de calor día × hora** — solo para retail o atención presencial: revela horarios muertos y picos de
   demanda para dotación de personal.
8. **Nuevos vs. recurrentes** — barras apiladas por periodo; separa crecimiento por captación de crecimiento por
   fidelidad.

## Layout sugerido

```
[ KPIs: venta neta | margen % | ticket promedio | unidades | cumplimiento meta ]
[ Tendencia de venta neta vs. periodo comparativo — ancho completo   ]
[ Top 10 productos           ][ Participación por canal (100 % apilado) ]
[ Pareto de clientes         ][ Meta vs. real por vendedor              ]
[ Tabla de comprobantes / detalle de líneas                             ]
```

## Tablas de detalle

- **Por comprobante**: fecha, número, cliente, vendedor, canal, subtotal, IGV, total, estado.
- **Por producto**: código, descripción, unidades, venta neta, costo, margen, % margen, participación.
- Incluir siempre fila de totales y exportación con los mismos filtros aplicados.

## Trampas de cálculo

- **Anulados**: excluirlos del numerador y del denominador; si se cuentan como venta cero inflan el conteo de
  comprobantes y hunden el ticket promedio.
- **Devoluciones fuera de periodo**: una nota de crédito de este mes contra una venta del mes pasado. Definir el
  criterio (por fecha del documento original o por fecha de la nota) y aplicarlo en todo el reporte.
- **Descuentos globales de cabecera**: hay que prorratearlos entre las líneas o el margen por producto queda mal.
- **Venta con IGV mezclada**: si el sistema guarda precios con IGV incluido, dividir entre 1.18 antes de sumar,
  no después de agrupar con redondeos.
- **Meta prorrateada**: comparar un mes en curso contra la meta completa da un cumplimiento falsamente bajo.
  Prorratear la meta por días transcurridos o comparar a la fecha.
- **Vendedor asignado vs. vendedor del documento**: aclarar cuál se usa cuando la comisión depende de eso.
