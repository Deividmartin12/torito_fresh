import type { Config } from 'tailwindcss';

/* Todos los estilos (base y componentes) viven en app/globals.css como CSS plano.
   Acá solo queda el contenido a escanear y los tokens de diseño del theme, que
   apuntan a las custom properties definidas en :root / html[data-theme='dark']
   de globals.css. Así existen utilidades como bg-surface, text-muted o rounded-ui
   sin duplicar la paleta. */
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
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
      },
      borderRadius: { ui: 'var(--ui-radius)', 'container-lg': 'var(--radius-container-lg)' },
      boxShadow: { flyout: 'var(--shadow-flyout)' },
    },
  },
  plugins: [],
};

export default config;
