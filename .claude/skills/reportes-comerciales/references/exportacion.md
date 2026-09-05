# Exportación de reportes (PDF, Excel, CSV)

## Regla base

Lo exportado debe coincidir exactamente con lo que el usuario ve en pantalla: mismos filtros, mismo rango,
mismos criterios de exclusión. Si el archivo trae más o menos datos que la vista, se pierde la confianza en el
reporte completo.

## Encabezado obligatorio

Todo archivo exportado empieza con:

- Nombre de la empresa y título del reporte
- Rango de fechas y periodo comparativo
- Filtros aplicados (sucursal, almacén, categoría, vendedor, proveedor)
- Criterio de las cifras ("montos en S/ sin IGV; excluye anulados; devoluciones descontadas")
- Fecha y hora de generación, y usuario que lo generó

## Excel (.xlsx)

Estructura de hojas recomendada:

1. **Resumen** — encabezado, KPIs y, si aplica, los gráficos principales.
2. **Detalle** — la tabla completa, una fila por registro, sin celdas combinadas.
3. **Parámetros** — filtros y definiciones de cada KPI.

Buenas prácticas:

- Números como **número**, fechas como **fecha**, con formato aplicado por celda. Nunca texto pre-formateado:
  `"S/ 1,234.56"` como cadena impide sumar y filtrar.
- Fila de encabezado congelada y autofiltro activado.
- Anchos de columna ajustados al contenido.
- Totales al final con `SUBTOTAL` para que respeten los filtros del usuario.
- Nada de celdas combinadas en la hoja de detalle: rompen tablas dinámicas.
- Si el usuario va a analizar por su cuenta, priorizar el detalle plano sobre el maquillaje.

## CSV

- UTF-8 **con BOM** para que Excel en Windows no rompa las tildes y la Ñ.
- Separador coherente con el locale: en configuraciones en español, Excel espera `;` — ofrecer la opción.
- Punto decimal y sin separador de miles en los números; el formato se aplica al abrir.
- Una sola fila de encabezado; nada de títulos ni filtros arriba (van en un archivo aparte o en el nombre).

## PDF

- Orientación horizontal para reportes con tablas anchas.
- Encabezado repetido en cada página y numeración "Página X de Y".
- Los gráficos se exportan como imagen vectorial o PNG en alta resolución; verificar que se rendericen en modo
  claro aunque la pantalla esté en oscuro.
- Evitar que una fila se parta entre páginas; repetir el encabezado de la tabla en cada página.
- El PDF es para imprimir o archivar; si el usuario quiere analizar, se le ofrece Excel.

## Nombre de archivo

Formato estable y ordenable:

```
reporte-<dominio>_<desde>_<hasta>[_<filtro>].<ext>
reporte-ventas_2026-01-01_2026-01-31.xlsx
reporte-almacen_2026-09-04_stock-actual_miraflores.pdf
```

Fechas en `aaaa-mm-dd`, minúsculas, sin espacios ni tildes.

## Rendimiento y errores típicos

- Exportaciones grandes (> 50 000 filas) se generan en el servidor de forma asíncrona, con aviso al terminar; no
  bloquear la interfaz ni construir el archivo en el navegador.
- Escribir por streaming o por lotes en vez de armar todo el dataset en memoria.
- Límite explícito y mensaje claro si se supera, con sugerencia de acotar el rango.
- Los códigos con ceros a la izquierda (SKU `007`) deben conservarlos: forzar formato de texto en esa columna.
- Verificar la codificación de tildes y símbolo `S/` antes de dar la exportación por terminada.
