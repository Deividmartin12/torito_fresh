---
name: reportes-comerciales
description: Metodología y catálogo de KPIs, gráficos y layouts para construir reportes y dashboards de compras, ventas y almacén/inventario. Usar SIEMPRE que se pida un reporte, dashboard, tablero, panel de indicadores, KPI, gráfico, estadística o análisis relacionado con ventas, facturación, cobranzas, compras, proveedores, órdenes de compra, almacén, inventario, stock, kardex, rotación o quiebres — en cualquier stack (React, Next.js, Vue, HTMX/Jinja, HTML plano, Python, SQL) y en cualquier formato (pantalla, PDF, Excel). Aplica incluso si el usuario solo dice "hazme un gráfico de ventas", "quiero ver el stock por almacén" o "necesito una vista de resumen", sin usar la palabra reporte.
---

# Reportes de compras, ventas y almacén

Un reporte útil responde una pregunta de negocio y sugiere una acción. Un reporte inútil muestra datos bonitos.
Toda esta skill existe para empujar cada entrega hacia lo primero: primero la pregunta, después el indicador,
al final el gráfico.

## Paso 0 — Contexto antes de código

Antes de escribir nada:

1. **Identificar el stack existente** (framework, librería de gráficos, sistema de estilos, ORM/SQL) y seguirlo.
   Si no existe proyecto, preguntar qué stack usar antes de escribir código.
2. **Aplicar la skill `estilo-frontend-personal`** si está disponible: define paleta, tipografía, radios, modo
   claro/oscuro, tablas con búsqueda + filtro + paginación, animaciones y comportamiento del sidebar. Esta skill
   aporta el *qué mostrar*; esa otra aporta el *cómo se ve*. No se contradicen.
3. **Preguntar por el modelo de datos real** si no se conoce: nombres de tablas, si hay documentos anulados,
   devoluciones, si los precios incluyen IGV, qué método de costeo se usa. Un reporte con la lógica correcta y
   estilo pobre sirve; al revés no.

Si el usuario no da rango de fechas ni granularidad, asumir **mes actual con comparación contra el mes anterior**
y decirlo explícitamente en el encabezado del reporte, en lugar de preguntar por cada detalle.

## Paso 1 — La pregunta antes del gráfico

Escribir (aunque sea mentalmente) la pregunta que responde cada bloque del reporte. Si un gráfico no responde
ninguna, se elimina. Ejemplos de preguntas reales por dominio:

- **Ventas**: ¿Vendimos más o menos que el periodo anterior y por qué? ¿Qué productos/clientes sostienen el
  ingreso? ¿Estamos cumpliendo la meta?
- **Compras**: ¿En qué y con quién se está gastando? ¿Nos están subiendo los precios? ¿Los proveedores entregan a
  tiempo y completo?
- **Almacén**: ¿Qué me va a faltar? ¿Qué plata está dormida en el estante? ¿El sistema coincide con el físico?

## Paso 2 — Elegir los indicadores

Cada dominio tiene su catálogo de KPIs con fórmulas, trampas de cálculo y los gráficos que le corresponden.
Leer el archivo del dominio que aplique antes de definir el reporte:

- `references/ventas.md` — ventas, márgenes, metas, clientes, canales, devoluciones.
- `references/compras.md` — gasto, proveedores, precios, lead time, OTIF, órdenes pendientes.
- `references/almacen.md` — stock, rotación, cobertura, quiebres, aging, ABC/XYZ, exactitud.

Regla de tablero: **4 a 6 KPIs arriba**, no doce. Cada tarjeta lleva valor, unidad y variación contra el periodo
comparativo (con flecha y color), nunca el valor solo y sin contexto.

## Paso 3 — Elegir el gráfico correcto

Tabla de decisión rápida:

| Intención | Gráfico | Notas |
|---|---|---|
| Evolución en el tiempo | Línea (área solo si es una serie acumulable) | Barras solo si hay ≤ 12 puntos |
| Comparar categorías | Barras **horizontales ordenadas por valor** | Nunca orden alfabético |
| Concentración (80/20) | Pareto: barras + línea de % acumulado | Ideal para proveedores, productos, clientes |
| Composición | Barras apiladas (o apiladas al 100 %) | Torta solo con ≤ 4 categorías |
| Meta vs. real | Barra con línea de referencia o bullet chart | Mostrar % de cumplimiento como número |
| Relación entre dos variables | Dispersión | Ej.: rotación vs. valor de stock (ABC) |
| Estado por rangos | Barras apiladas por tramo | Ej.: antigüedad de inventario 0-30/31-60/61-90/+90 |
| Detalle accionable | Tabla, no gráfico | Quiebres, órdenes pendientes, documentos anulados |

Detalles de formato, límite de series, colores semánticos, ejes, tooltips y antipatrones en
`references/graficos.md`. Leerlo antes de configurar la librería de gráficos.

## Paso 4 — Estructura estándar del reporte

Usar este orden salvo que el usuario pida otro. Funciona igual en pantalla, PDF o Excel:

```
1. Encabezado      → título, rango de fechas, filtros activos, comparativo, fecha/hora de generación
2. Filtros         → rango con presets, comparación, sucursal/almacén, categoría, responsable
3. Fila de KPIs    → 4-6 tarjetas: valor + variación vs. periodo anterior
4. Gráfico principal → la tendencia o la pregunta central, a todo el ancho
5. Gráficos de apoyo → 2-3 en grilla (composición, ranking, Pareto)
6. Tabla de detalle  → con búsqueda, filtro, selector de filas y paginación; exportable
7. Pie de reporte    → fuente de datos, definiciones de cada KPI, criterios de exclusión
```

El punto 7 se omite casi siempre y es el que evita discusiones: si "ventas" excluye anulados y devoluciones,
tiene que estar escrito en el reporte.

**Filtros mínimos**: rango de fechas con presets (hoy, ayer, últimos 7 días, mes actual, mes anterior, año a la
fecha, personalizado) y un selector de comparación (periodo anterior / mismo periodo del año anterior). Los
filtros aplicados deben viajar en la URL o el estado para que el reporte sea compartible y exportable tal cual
se ve.

## Reglas de datos que arruinan reportes

Verificar estas antes de dar por terminado el cálculo:

- **Periodos incompletos**: no comparar un mes en curso contra un mes completo. Comparar el mismo tramo
  (día 1-14 vs. día 1-14) y rotularlo como "mes a la fecha".
- **Documentos anulados y notas de crédito**: excluir anulados; restar devoluciones. Definir si el reporte es
  sobre venta bruta o neta y mantenerlo consistente en todos los bloques.
- **Impuesto**: separar base imponible e IGV. En Perú el IGV es 18 %; los reportes de gestión normalmente van
  sin IGV y los de facturación con IGV. Rotular la unidad en el título del eje ("S/ sin IGV").
- **Moneda**: si hay operaciones en más de una moneda, convertir a una moneda base con tipo de cambio de la
  fecha del documento (no el de hoy) y decir cuál se usó.
- **Costeo**: el margen depende del método (promedio ponderado, PEPS, costo estándar). Declararlo; no mezclar.
- **Zona horaria**: agregar por la fecha local del negocio, no UTC, o las ventas de la noche se corren de día.
- **Duplicados por joins**: al unir cabecera y detalle, los totales de cabecera se multiplican. Agregar el
  detalle primero y luego unir.
- **División por cero**: variaciones contra un periodo anterior en cero se muestran como "—" o "nuevo", no
  como ∞ ni 0 %.

## Formato de números, fechas y moneda

- Moneda por defecto: **soles (S/)** con formato `es-PE` → `S/ 1,234.56` (coma para miles, punto para decimales).
  Si el proyecto define otra, respetarla.
- Ejes con notación compacta: `S/ 1.2 M`, `S/ 850 K`. Los valores exactos van en el tooltip y en la tabla.
- Dinero sin decimales en KPIs y ejes; con dos decimales en tablas de detalle.
- Cantidades de stock con la unidad de medida al costado (`120 und`, `35.5 kg`).
- Porcentajes con un decimal (`12.4 %`); variaciones siempre con signo (`+8.3 %`).
- Fechas `dd/mm/aaaa`; en ejes de tiempo, etiquetas cortas (`Ene`, `12 Ene`) y el año solo cuando cambia.
- Nunca mostrar un número sin unidad ni periodo.

## Rendimiento

Los reportes se vuelven lentos por traer filas crudas al cliente. Evitarlo:

- Agregar en la base de datos (`GROUP BY`, vistas materializadas, tablas de resumen diarias), no en JavaScript.
- Paginación y ordenamiento del lado del servidor en las tablas de detalle.
- Un endpoint por bloque del reporte, para que los KPIs aparezcan sin esperar al gráfico pesado.
- Índices por fecha + sucursal/almacén, que es el filtro de casi toda consulta.
- Cachear resultados de periodos cerrados; solo el periodo en curso necesita recalcularse.

## Estados y accesibilidad

- **Cargando**: esqueleto con la forma del gráfico, no un spinner que desplaza el layout.
- **Sin datos**: mensaje que dice qué filtro relajar ("No hay ventas entre el 01/01 y el 07/01 para la sucursal
  Miraflores"), no un lienzo vacío.
- **Error**: mensaje concreto y botón de reintento; nunca un gráfico en cero, que se lee como "vendimos cero".
- El color no puede ser el único portador de significado: acompañar con etiqueta, ícono o patrón.
- Todo gráfico debe tener su equivalente tabular accesible (la tabla de detalle suele cumplir esta función).

## Exportación

Si el reporte se descarga (PDF, Excel, CSV), leer `references/exportacion.md`: contiene la estructura de hojas,
el encabezado obligatorio, el formato de nombre de archivo y los errores típicos de exportación.

## Checklist antes de entregar

- [ ] Cada bloque responde una pregunta de negocio explícita.
- [ ] Los KPIs muestran variación contra un periodo comparativo.
- [ ] Barras ordenadas por valor; series limitadas (resto agrupado en "Otros").
- [ ] Unidades, moneda y criterio (con/sin IGV, bruto/neto) visibles.
- [ ] Filtros reflejados en el encabezado y en la exportación.
- [ ] Estados de carga, vacío y error implementados.
- [ ] Agregación hecha en el servidor, tabla paginada del lado del servidor.
- [ ] Modo claro y oscuro verificados en los gráficos (ejes, grilla y tooltips también).
