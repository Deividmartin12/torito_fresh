---
name: selector-entidad-buscable
description: 'Patrón de UI/UX de David para reemplazar cualquier select/combo box de formulario que referencia otra entidad (Cliente, Producto, Proveedor, Almacén, Vendedor, Categoría, etc.) por un selector con buscador tipo autocomplete, estado "sin resultados", opción fija opcional (ej. "NO REGISTRADO") y un botón "+ Agregar {entidad}" para alta rápida sin salir del formulario. USAR SIEMPRE que se cree o edite un campo de formulario que sea una referencia/FK a otra tabla o entidad, aunque el usuario solo diga "selector de cliente", "combo de producto", "dropdown que busque", "autocomplete", "campo que referencia a X", o simplemente pida un select para algo que viene de una lista de la base de datos — no hace falta que pida explícitamente "buscador" para que aplique. Independiente del framework (React, Vue, Angular, HTML plano, etc.). Si el proyecto también tiene la skill de estilo-frontend-personal, combinar ambas — esta define el comportamiento del componente, la otra define look & feel (colores, radios, animaciones).'
---

# Selector de entidad con búsqueda y alta rápida — David

Reemplaza los `<select>` tradicionales (con `<option>` estáticas) por un componente de búsqueda cada vez que el campo referencia una **entidad de otra tabla/colección** (Cliente, Producto, Proveedor, Almacén, Vendedor, Categoría, etc.). Un `<select>` plano no escala cuando la lista crece, no permite crear el registro al vuelo, y no da feedback de "no existe".

**No aplica** a combos de opciones fijas y cortas que no vienen de una entidad externa (ej. "Estado: Activo/Inactivo", "Tipo de comprobante: Boleta/Factura"). Esos siguen siendo un `<select>` o grupo de radios normal.

## Antes de escribir código

1. Identificá el stack del proyecto (igual criterio que `estilo-frontend-personal`: si hay proyecto existente, usar su framework/lenguaje/sistema de estilos; si no hay nada, preguntar antes de asumir).
2. Identificá **cómo se obtienen las opciones**: lista ya cargada en memoria/frontend (filtrado local) vs. lista grande que requiere pedirla a un endpoint mientras se escribe (filtrado remoto con debounce). Esto cambia la implementación pero no el comportamiento visible.
3. Definí, por entidad, si corresponde una **opción fija/pineada** (ver abajo) — no todas las entidades la necesitan. Ejemplo real de este proyecto: en "Cliente" existe la opción fija `NO REGISTRADO` para ventas sin cliente registrado (venta genérica/mostrador). "Producto" o "Proveedor" normalmente no necesitan una opción fija.
4. Definí qué pasa al usar "+ Agregar {entidad}": por defecto abre un modal, pero **nunca uno nuevo hecho a medida para este selector**. Fijate si esa entidad ya tiene un modal/formulario de "Crear {entidad}" en su pantalla principal (ej. el modal "Crear cliente" de la pantalla de Clientes) y **reusá ese mismo componente** desde acá. Si el proyecto todavía no tiene ningún modal de creación para esa entidad, creá uno solo (genérico, reutilizable) y usalo tanto desde la pantalla principal como desde este selector — nunca dupliques el formulario de alta en dos componentes distintos.

## Anatomía del componente

```
Componente: SelectorEntidadBuscable
  props conceptuales:
    entidad            → nombre singular para textos ("cliente", "producto", ...)
    valorSeleccionado  → el registro actualmente elegido, o null
    obtenerOpciones    → función (texto de búsqueda) → lista de resultados (local o remota)
    opcionFija         → opcional: { etiqueta, valor } que siempre aparece arriba del todo,
                          incluso sin escribir nada (ej. "NO REGISTRADO")
    onSeleccionar      → callback al elegir un resultado o la opción fija
    onCrearNuevo       → callback al presionar "+ Agregar {entidad}"

  estado: cerrado | abierto

  ESTADO CERRADO (trigger):
    si no hay valorSeleccionado:
      se ve como un input de búsqueda con ícono de lupa a la izquierda
      placeholder: "Buscar {entidad}" (ej. "Buscar cliente")
    si hay valorSeleccionado:
      muestra la etiqueta del registro elegido (no el placeholder)
      ícono de "limpiar" (x) a la derecha para volver a estado sin selección
    al enfocar/hacer click: pasa a estado abierto

  ESTADO ABIERTO (panel flotante, anclado debajo del trigger, incluye el input de búsqueda arriba):
    orden de contenido, de arriba hacia abajo:
      1. opción fija (si existe), siempre visible, incluso con el buscador vacío
      2. separador sutil (solo si hay opción fija Y hay resultados o el mensaje de vacío debajo)
      3. resultados filtrados según lo tipeado, uno por fila, clickeables
         - si la lista es local: filtrar mientras se tipea, sin delay perceptible
         - si la lista es remota: debounce ~300ms antes de pedir al backend, mostrar
           un estado de carga sutil (spinner chico o skeleton de 2-3 filas) mientras responde
      4. si no hay ningún resultado que matchee el texto buscado (y no hay opción fija,
         o la opción fija tampoco aplica al texto buscado): mensaje neutro tipo
         "No se encontraron resultados" — texto secundario, no interactivo
      5. separador sutil
      6. fila fija al final, siempre visible (haya o no resultados): "+ Agregar {entidad}"
         como link/acción de color primario con ícono "+", nunca se filtra ni desaparece

  cierre del panel: al elegir una opción, al hacer click afuera, o con tecla Escape
```

## Comportamiento

- **Teclado**: flechas arriba/abajo mueven el foco entre filas (incluida la opción fija y la fila "+ Agregar"), Enter selecciona la fila enfocada, Escape cierra sin cambiar la selección.
- **Búsqueda**: no distingue mayúsculas/minúsculas ni tildes. Si la lista es remota, buscar por los campos relevantes de la entidad (nombre, documento, código, etc. según corresponda) y no solo por "empieza con".
- **Alta rápida ("+ Agregar {entidad}")**:
  - Nunca se oculta ni se deshabilita, sin importar si ya hay resultados coincidentes: el usuario puede querer crear un registro nuevo aunque existan parecidos.
  - **Reutilizar el modal de creación que ya existe para esa entidad** (el mismo que se usa desde el botón "Nuevo/Crear {entidad}" de su pantalla/listado principal) — no armar un modal paralelo ni un formulario reducido "solo para este caso". Es el mismo componente, invocado desde otro lugar del código.
    - Si ese modal ya existe: importarlo/invocarlo tal cual, con su misma validación y sus mismos campos — no recortarle campos para que sea "más rápido".
    - Si esa entidad todavía no tiene modal de creación en ningún lado: es el momento de crearlo una sola vez como componente reutilizable, y usarlo desde ambos lugares (pantalla principal y este selector) para no terminar manteniendo dos formularios de alta que hacen lo mismo.
  - Al guardar exitosamente el modal: cerrarlo, y **auto-seleccionar** el registro recién creado en el selector (no dejar al usuario buscarlo de nuevo). Esto normalmente implica que el modal de creación reusado exponga un callback `onCreado(registro)` (o equivalente) que el selector pueda enganchar, además del que ya usa la pantalla principal para refrescar su propio listado.
  - Si falla la creación, el modal se mantiene abierto mostrando el error; el selector no cambia de estado.
- **Opción fija**: si existe, se comporta como un resultado más a efectos de teclado/click, pero nunca se filtra por el texto de búsqueda ni desaparece.
- **Validación de formulario**: el campo se considera "sin completar" si `valorSeleccionado` es null. Si la opción fija es un valor válido para enviar (como "NO REGISTRADO"), seleccionarla sí cuenta como campo completo.

## Estilo visual

Si el proyecto tiene la skill `estilo-frontend-personal`, usar sus tokens directamente:
- Input/trigger: forma pill, ícono líder color texto secundario, foco con borde primario + halo suave.
- Panel flotante: mismo tratamiento que el patrón "Flyout / Dropdown" (fade + leve desplazamiento ~150ms ease-out, sombra media difusa porque no hay scrim detrás, sin scrim).
- Fila de resultado: hover con tinte de fondo sutil, igual que filas de tabla.
- "+ Agregar {entidad}": texto en color primario, ícono "+" del mismo color, sin fondo propio.
- Mensaje de "sin resultados" y la opción fija (si no es interactiva más que para seleccionar): texto secundario, sin badge ni color de alerta — no es un error, es un estado normal.

Si el proyecto **no** tiene esa skill ni un sistema de diseño propio: usar bordes sutiles, radios redondeados generosos, una sola sombra suave en el panel flotante, y transición corta (120–200ms) — mantenerlo minimalista y evitar inventar un estilo cargado.

## Checklist rápido al implementar un campo nuevo

1. ¿Es una referencia a otra entidad? → sí: aplica este patrón. No: `<select>`/radio normal.
2. ¿Las opciones vienen ya cargadas o hay que pedirlas mientras se escribe? → define filtrado local vs. remoto con debounce.
3. ¿Esta entidad necesita una opción fija tipo "NO REGISTRADO"? → si sí, definir su etiqueta y su valor real a guardar.
4. ¿Qué campos mínimos pide el modal de alta rápida de "+ Agregar {entidad}"? → mantenerlo corto (lo justo para crear el registro, no el formulario completo de esa entidad).
5. ¿Qué pasa tras crear? → auto-seleccionar y cerrar el modal.

## Cuándo no aplica

Si el proyecto ya tiene su propio componente equivalente (ej. una librería de UI con su propio "AsyncSelect" o "Combobox") y David no pide explícitamente cambiarlo, respetar el componente existente y solo ajustar su configuración (opción fija, alta rápida) en vez de reemplazarlo por uno nuevo.
