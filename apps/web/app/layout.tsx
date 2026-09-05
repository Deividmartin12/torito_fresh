import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppToaster } from '../components/AppToaster';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Torito Fresh',
  description: 'Sistema administrativo de venta y reparto de bidones de agua',
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
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
