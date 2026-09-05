# Diseño y configuración de gráficos

## Contenido
- Reglas generales
- Colores y semántica
- Ejes, grilla y etiquetas
- Tooltips y leyendas
- Antipatrones
- Notas por librería

## Reglas generales

- **Máximo 5-7 series** por gráfico. El resto se agrupa en "Otros" y se puede explorar en la tabla.
- **Ordenar por valor** en todo gráfico de categorías, descendente. El orden alfabético esconde el hallazgo.
- **Barras horizontales** cuando las etiquetas son nombres (productos, proveedores, clientes): se leen sin rotar
  el texto. Verticales solo para series de tiempo cortas.
- **Un mensaje por gráfico**. Si hacen falta dos ejes y tres tipos de marca para explicarlo, son dos gráficos.
- **Altura mínima usable**: 240-320 px en pantalla. Por debajo, las líneas se aplastan y todo parece plano.
- Los gráficos comparten la paleta y el modo claro/oscuro del proyecto; ejes, grilla y tooltips también cambian
  con el tema (es el error más común: el gráfico queda con grilla negra sobre fondo oscuro).
- Todo gráfico lleva **título corto y subtítulo con el periodo y la unidad** ("Venta neta mensual — S/ sin IGV").

## Colores y semántica

- Un color de acento del proyecto para la serie principal; grises para el periodo comparativo (punteado).
- Semáforo solo donde hay juicio de valor: verde = dentro de meta, ámbar = en riesgo, rojo = fuera de meta o
  quiebre. No pintar de rojo un número simplemente porque bajó.
- Categorías sin orden natural: paleta cualitativa estable, siempre el mismo color para la misma categoría en
  todo el reporte (que "Miraflores" cambie de color entre gráficos destruye la lectura).
- Escalas de magnitud (mapas de calor): una sola tonalidad de claro a oscuro, no arcoíris.
- Nunca depender solo del color: agregar etiqueta directa, ícono o patrón.

## Ejes, grilla y etiquetas

- Barras: el eje de valores **siempre empieza en cero**. Truncarlo exagera diferencias y es engañoso.
- Líneas: se puede acotar el rango para ver variación fina, pero indicándolo.
- Grilla horizontal tenue; sin grilla vertical en barras horizontales.
- Etiquetas de eje en notación compacta (`S/ 1.2 M`, `850 K`); valores exactos en tooltip.
- En series de tiempo, mostrar cada N-ésima etiqueta si se solapan; nunca rotar 90°.
- Etiquetas de datos directamente sobre las barras cuando son ≤ 10; en gráficos densos, solo en el tooltip.
- Líneas de referencia (meta, mínimo, máximo) punteadas, con su valor rotulado al extremo.

## Tooltips y leyendas

- El tooltip muestra: categoría o fecha, valor formateado con moneda/unidad, comparativo y % de variación.
- En gráficos de tiempo con varias series, tooltip compartido por eje X (todas las series del punto a la vez).
- Sin leyenda cuando hay una sola serie. Con dos o tres, preferir etiqueta directa junto a la línea.
- La leyenda debe permitir aislar series al hacer clic si la librería lo soporta.

## Antipatrones

| No hacer | Hacer |
|---|---|
| Torta con 8 rebanadas | Barras horizontales ordenadas |
| Torta o barra 3D, sombras y degradados | Formas planas |
| Doble eje Y decorativo | Dos gráficos apilados, o doble eje solo si son magnitudes ligadas (venta y % margen) |
| Barras con eje truncado | Eje desde cero |
| Serie de tiempo con barras y 90 puntos | Línea |
| Mostrar los 3000 SKUs | Top N + "Otros" + tabla completa aparte |
| Gauge/velocímetro para un KPI | Número grande + variación + sparkline |
| Animar el gráfico en cada refresco de filtro | Transición corta solo al cambiar de dataset |
| Colores distintos para la misma categoría en gráficos distintos | Paleta mapeada por categoría |

## Notas por librería

Usar la que ya tenga el proyecto. Si no hay ninguna:

- **React / Next.js** → Recharts para lo estándar (líneas, barras, apiladas, dispersión, referencias); ECharts si
  se necesitan Pareto con doble eje, mapas de calor o volúmenes grandes de puntos.
- **HTMX + Jinja / HTML plano** → ECharts o Chart.js por CDN, inicializados con un script pequeño por bloque.
  Pasar los datos ya agregados desde el backend como JSON en el template.
- **Backend Python** → agregar con SQL o pandas y enviar solo el resultado agregado; no serializar el detalle.

Independiente de la librería:

- El componente de gráfico recibe **datos ya agregados y formateados**, no filas crudas.
- Los formateadores de moneda, porcentaje y fecha viven en un único módulo compartido por gráficos, tarjetas,
  tablas y exportación, para que el mismo número no se vea distinto en dos lugares.
- Los gráficos deben ser responsivos por contenedor y tener altura fija definida, para que el layout no salte
  mientras cargan.
