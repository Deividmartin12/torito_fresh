import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tORITO FRESH",
  description: "Sistema administrativo de venta y reparto de vidones de agua",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
