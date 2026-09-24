import type { Config } from 'tailwindcss';

/* Todos los estilos (base y componentes) viven en app/globals.css como CSS plano.
   Acá solo queda el contenido a escanear y los tokens de diseño del theme, que
   apuntan a las custom properties definidas en :root / html[data-theme='dark']
   de globals.css. Así existen utilidades como bg-surface, text-muted o rounded-ui
   sin duplicar la paleta.

   Fundación de la migración a Tailwind (fase 3 del pedido de "corregir el audit"):
   - `darkMode` usa la estrategia de selector (Tailwind 3.4+) apuntando al mismo
     atributo `data-theme` que ya pone `ThemeToggle.tsx`, en vez de la clase `.dark`
     por defecto. Así `dark:bg-surface` funciona sin tocar el mecanismo de tema que
     ya existe.
   - `screens` reemplaza por completo los cortes de Tailwind (sm/md/lg/xl/2xl): la
     convención del proyecto es "tres tramos y nada más" (ver el comentario de
     cabecera de globals.css). Sin prefijo = móvil (≤700px, es la base mobile-first);
     `tablet:` = 701px en adelante; `desktop:` = 1024px en adelante. Los mismos
     tres tramos, sin nombres nuevos que inventar. */
const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    screens: {
      tablet: '701px',
      desktop: '1024px',
    },
    extend: {
      colors: {
        ink: '#15213a',
        brand: { 500: '#2563eb', 600: '#1d4ed8' },
        page: 'var(--page-bg)',
        surface: {
          DEFAULT: 'var(--surface)',
          soft: 'var(--surface-soft)',
          hover: 'var(--surface-hover)',
        },
        line: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        fg: 'var(--text)',
        muted: 'var(--text-muted)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)',
          'soft-text': 'var(--accent-soft-text)',
        },
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
        },
        // El degradado de la tarjeta hero de los paneles: la única superficie de
        // marca de la app (ver StatHero.tsx). Sirve para `from-hero-from to-hero-to`.
        hero: { from: 'var(--hero-from)', to: 'var(--hero-to)' },
        // Badges de estado. Cada color tiene su fondo pastel y su texto, igual que
        // `.status-*` en globals.css — se exponen para que un badge nuevo escrito en
        // utilidades (fase 5) no tenga que inventar sus propios tonos.
        status: {
          green: { bg: 'var(--status-green-bg)', text: 'var(--status-green-text)' },
          amber: { bg: 'var(--status-amber-bg)', text: 'var(--status-amber-text)' },
          red: { bg: 'var(--status-red-bg)', text: 'var(--status-red-text)' },
          blue: { bg: 'var(--status-blue-bg)', text: 'var(--status-blue-text)' },
          gray: { bg: 'var(--status-gray-bg)', text: 'var(--status-gray-text)' },
        },
        // Fondo oscurecido detrás de modales y drawers (ver la skill de estilo: sólido
        // semitransparente, nunca `backdrop-filter: blur()`).
        scrim: 'var(--scrim)',
      },
      borderRadius: {
        ui: 'var(--ui-radius)',
        'container-lg': 'var(--radius-container-lg)',
        // Todo lo interactivo (botones, inputs, badges) es pill: `rounded-control`.
        control: 'var(--radius-control)',
      },
      boxShadow: {
        // Ausente por defecto en toda la app; solo los flyouts sin scrim detrás llevan
        // sombra (ver la skill de estilo). `shadow-flyout` es la única sombra real.
        flyout: 'var(--shadow-flyout)',
      },
    },
  },
  plugins: [],
};

export default config;
