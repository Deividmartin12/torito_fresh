---
name: estilo-frontend-personal
description: Sistema de diseño y metodología de trabajo personal de David para construir interfaces web (dashboards, paneles admin, tablas de datos, formularios, prototipos) — independiente del lenguaje o framework. Usar SIEMPRE que se cree o rediseñe un frontend, mockup, landing, panel interno o cualquier UI, sea en React, Vue, Svelte, Next.js, HTML plano o cualquier otro stack, incluso si el usuario no lo pide explícitamente — con solo mencionar "interfaz", "dashboard", "panel", "tabla", "sidebar", "formulario", "prototipo" o "mockup" ya aplica. Antes de escribir código, identifica el stack del proyecto existente (o pregunta si no hay ninguno) y aplicá sobre él la paleta, tipografía, radios, modo claro/oscuro, tablas con búsqueda/filtro/paginación, animaciones de modal/drawer/flyout, sidebar colapsable con submenú flotante, y buenas prácticas de código simple y legible.
---

# Estilo de frontend personal — David

Este documento define el **lenguaje visual y la metodología** de David para construir interfaces. No está atado a ningún lenguaje ni framework: el proyecto define el stack, esta skill define cómo debería verse y comportarse la interfaz sobre ese stack.

**Filosofía en una frase:** minimalista moderno, espacioso, formas muy redondeadas en elementos interactivos, acento azul, modo claro/oscuro desde el día uno, animaciones suaves en overlays, y sombras casi ausentes salvo que algo flote sin fondo detrás.

**Alcance:** esto es solo frontend/UI — comportamiento visual e interactivo. No incluye backend, endpoints ni lógica de datos real; para prototipos, usar datos de ejemplo.

## Antes de escribir código

1. **Si hay un proyecto existente**: identificá el framework y el lenguaje que usa (React, Vue, Svelte, Next.js, Angular, HTML plano, etc.).
2. Identificá el sistema de estilos que ya tiene (Tailwind, CSS Modules, styled-components, Sass, CSS-in-JS, CSS plano, etc.) y usalo — no introduzcas uno nuevo.
3. Respetá la arquitectura y los patrones de componentes ya establecidos en el proyecto.
4. Usá las dependencias ya instaladas (librería de iconos, de animación, etc.) cuando sea posible. No sumes un framework o librería nueva si no hace falta.
5. **Si NO hay ningún proyecto ni stack detrás** (por ejemplo, estás armando un prototipo desde cero, sin código previo): **preguntale a David qué stack quiere usar antes de escribir nada.** No asumas HTML/CSS/JS ni ningún otro por defecto.

Todo lo que sigue (tokens, componentes, comportamientos) se traduce a la sintaxis y los paradigmas del stack que corresponda — son especificaciones de diseño, no código para copiar y pegar.

## Buenas prácticas de código — priorizar que se entienda

David quiere poder leer y entender el código, no solo que funcione. Ante la duda entre una solución "elegante" pero abstracta y una simple pero un poco más repetitiva, elegir la simple.

- Usar los patrones idiomáticos del lenguaje/framework del proyecto (si es React, componentes y hooks estándar; si es Vue, la sintaxis que ya use el proyecto; etc.) — no inventar convenciones propias.
- Funciones/componentes cortos, con nombres que digan qué hacen.
- Nombres de variables, clases, IDs o componentes descriptivos, nunca genéricos.
- Cero dependencias nuevas más allá de las que ya tiene el proyecto, salvo que sea estrictamente necesario para lo pedido.
- Preferir algo de repetición antes que una abstracción que complique seguir el flujo de arriba a abajo.
- Comentarios cortos solo donde algo no es obvio a simple vista — no comentar lo evidente.
- Reusar los mismos patrones de este documento en vez de inventar una variante distinta para cada pantalla nueva.

## Design tokens

Valores universales (hex / px / rem), con nota de equivalencia en Tailwind porque es lo que David usa seguido — pero el valor real es el universal, no la clase.

| Token | Valor universal | Equivalencia Tailwind (referencia) |
|---|---|---|
| Color primario (claro) | `#2563eb` | `blue-600` |
| Color primario (oscuro) | `#3b82f6` | `blue-500` |
| Fondo base (claro / oscuro) | `#ffffff` / `#030712` | `white` / `gray-950` |
| Fondo de superficie (claro / oscuro) | `#ffffff` / `#111827` | `white` / `gray-900` |
| Texto principal (claro / oscuro) | `#111827` / `#f3f4f6` | `gray-900` / `gray-100` |
| Texto secundario (claro / oscuro) | `#6b7280` / `#9ca3af` | `gray-500` / `gray-400` |
| Borde (claro / oscuro) | `#e5e7eb` / `#1f2937` | `gray-200` / `gray-800` |
| Radio estándar (botones, inputs, badges, pills de nav) | totalmente redondeado (pill, `9999px`) | `rounded-full` |
| Radio contenedores grandes (cards, paneles, modales, flyouts) | grande, `16–24px` | `rounded-2xl` a `rounded-3xl` |
| Espaciado interno de contenedores | generoso, `24px+` | `p-6` o más |
| Espaciado entre elementos | `12–16px` | `gap-3` / `gap-4` |
| Transición hover | `150–200ms` | `duration-200` |
| Transición drawer | `250–300ms ease-out` | `duration-300` |
| Transición flyout/dropdown | `120–150ms ease-out` | `duration-150` |
| Transición modal | `~200ms ease-out` | `duration-200` |
| **Qué propiedades animar** | **solo `transform` y `opacity`** (son las únicas "baratas", no fuerzan recalcular layout ni repintar toda la pantalla). Nunca animar `width`, `height`, `top`/`left`, `box-shadow` ni `filter` directamente — si algo necesita moverse o cambiar de tamaño, hacerlo con `transform: translate/scale`, no cambiando esas propiedades cuadro a cuadro | — |
| **Sombras** | **evitar por defecto**; usar borde + contraste de color de superficie en su lugar. Única excepción: elementos que flotan sobre contenido **sin** overlay/scrim detrás (flyouts, dropdowns, tooltips) → ahí sí, una sombra chica y con poco desenfoque (nada de sombras grandes/muy difusas, cuestan más renderizar) | — |
| **Blur / desenfoque** | **nunca usar** `backdrop-filter: blur()` ni `filter: blur()` en ningún elemento (scrims, headers, sidebar, cards, nada) — es de los efectos más costosos en rendimiento, sobre todo si hay varios en pantalla o en hardware modesto. El oscurecido de fondo de modales/drawers se logra solo con un color sólido semitransparente, sin desenfoque | — |

**Tipografía:** Inter como default cuando se arranca de cero sin sistema tipográfico previo; si el proyecto ya define una tipografía, respetarla. Pesos: regular/medium/semibold/bold.

**Iconos:** estilo outline, trazo consistente y fino. Si el proyecto ya usa un set de iconos, usar ese (no mezclar dos sets). Si se arranca de cero, Lucide es el default razonable — pero se define recién después de saber el stack (ver "Antes de escribir código"). **Nunca llevan fondo propio**: nada de caja, círculo o chip de color detrás del glifo — siempre planos/transparentes, coloreados solo por su propio color de trazo. Un fondo solo es aceptable en el elemento interactivo completo que los contiene (ej. el hover de un botón de solo-ícono se aplica al botón entero, no a una cajita separada detrás del ícono).

**Modo claro/oscuro:** siempre presente desde el inicio, con toggle visible, preferencia persistida (el mecanismo de guardado depende del stack: `localStorage` en web, el storage nativo que corresponda en otros contextos), respeta la preferencia del sistema como fallback, y se aplica antes del primer render para evitar parpadeo del tema incorrecto.

## Patrones de componentes

Especificaciones de estructura y comportamiento, en pseudo-notación neutra — traducir a los componentes/elementos reales del stack que corresponda.

```
Componente: Botón — variante primaria
  forma: pill
  fondo: color primario sólido
  texto: blanco
  padding: cómodo (medio-alto)
  hover: oscurece levemente el fondo
  sombra: ninguna

Componente: Botón — variante secundaria/ghost
  forma: pill
  fondo: transparente o neutro
  borde: sutil, color borde
  texto: color texto principal
  hover: fondo neutro muy suave
  sombra: ninguna

Componente: Botón — solo ícono
  forma: circular
  ícono: color texto secundario
  hover: fondo neutro muy suave
  sombra: ninguna

Componente: Input (ej. buscador)
  forma: pill
  ícono líder: dentro del campo, a la izquierda, color texto secundario
  borde: sutil, color borde
  foco: borde en color primario + halo suave del mismo color
  sombra: ninguna
```

```
Componente: Badge de estado
  forma: pill
  contenido: punto pequeño de color sólido + texto
  fondo: versión pastel del color de estado
  texto: tono más oscuro del mismo color
  mapeo semántico:
    positivo/activo → azul o verde
    advertencia → ámbar
    error/negativo → rojo
    neutral/inactivo → gris (si está anulado, agregar tachado)
```

```
Componente: Sidebar
  estado: expandido | colapsado

  expandido:
    ancho amplio
    cada categoría: ícono + texto, ancho completo, forma pill
    categoría con subcategorías: lista desplegable inline (acordeón), indentada, cada ítem en pill

  colapsado:
    ancho angosto, solo íconos, centrados
    al pasar el cursor sobre una categoría CON subcategorías:
      aparece un panel flotante anclado a la derecha del ícono
      contenido del panel: nombre de la categoría como etiqueta no interactiva + SOLO sus subcategorías como links
      nunca repite la lista completa de categorías dentro del panel
      animación de entrada: fade + leve desplazamiento, ~150ms ease-out
      se cierra: al sacar el cursor del área ícono+panel, o al hacer click afuera

  botón de colapsar/expandir:
    uno solo, alterna entre los dos estados
    verificar que funcione en ambos sentidos (colapsar Y expandir)

  ítem activo (en cualquier estado): fondo pastel del color primario, sin borde ni línea de acento
```

```
Componente: Modal
  layout: centrado, superpuesto
  fondo detrás: oscurecido con un color sólido semitransparente (scrim), sin desenfoque
  entrada: el panel escala levemente hacia arriba (ej. 95%→100%) + fade in, ~200ms ease-out
  salida: la animación inversa
  forma: esquinas grandes redondeadas
  sombra: normalmente innecesaria (el scrim ya lo separa del fondo); si hace falta, algo muy sutil
  cuándo usar: acciones rápidas — crear/editar un registro simple, confirmaciones, formularios cortos (hasta ~6 campos)

Componente: Drawer
  layout: pegado a un borde de la pantalla (por defecto, derecha), alto completo
  fondo detrás: igual que el modal (scrim oscurecido, sin desenfoque)
  entrada: desliza desde afuera de la pantalla hacia su posición final, ~250–300ms ease-out
  forma: esquinas grandes redondeadas del lado interior
  sombra: igual que el modal, normalmente innecesaria
  cuándo usar: detalle completo de un registro con varias secciones, formularios largos, flujos multi-paso

Componente: Flyout / Dropdown (ver también Sidebar)
  aparece: anclado a su disparador, flotando sobre el contenido SIN scrim detrás
  entrada: fade + leve desplazamiento direccional (~10px), ~150ms ease-out
  sombra: sí hace falta acá — media y difusa — porque no hay nada más que lo separe del contenido
  se cierra: al sacar el cursor (si se activa por hover) o al hacer click afuera (si se activa por click)
```

```
Componente: Tabla de datos
  arriba de la tabla: input de búsqueda (con ícono) + botón de filtros
  debajo de la tabla: selector de "filas por página" + texto "mostrando X–Y de Z" + controles de paginación (anterior/siguiente + números de página)
  filas: sin bordes de celda pesados, separador fino entre filas, padding vertical generoso
  hover de fila: tinte de fondo sutil
  columna de estado: badge (ver arriba)
  columna de acciones: al final, alineada a la derecha, con botones de ícono o un botón secundario "Abrir"
  checkboxes de selección de fila (si aplica): forma cuadrada redondeada (no pill), para mantener el affordance de checkbox
```

## Cuándo NO aplica este estilo

Si David menciona explícitamente que un proyecto puntual ya tiene su propio sistema de diseño consolidado y distinto (más denso, con más presencia de glass/blur, otra paleta, etc.), priorizá esas instrucciones puntuales por sobre este default. Este documento es el punto de partida, no una regla rígida — y el stack del proyecto siempre gana por sobre cualquier sugerencia tecnológica implícita acá.