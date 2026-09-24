import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { AppToaster } from '../components/AppToaster';
import { QueryProvider } from '../components/QueryProvider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Torito Fresh',
  description: 'Sistema administrativo de venta y reparto de bidones de agua',
};

// viewportFit: 'cover' es lo que hace que env(safe-area-inset-*) devuelva un valor real;
// sin esto los modales y las barras fijas quedan debajo de la barra de gestos del iPhone.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("torito-theme");if(t!=="dark"&&t!=="light"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){document.documentElement.dataset.theme="light"}})();`,
          }}
        />
      </head>
      <body className={inter.className}>
        <QueryProvider>
          {children}
          <AppToaster />
        </QueryProvider>
      </body>
    </html>
  );
}
