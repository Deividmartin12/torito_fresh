import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { LandingBehavior } from '../components/landing/LandingBehavior';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3070'),
  title: 'Agua Torito Fresh | Agua en bidones a domicilio',
  description:
    'Agua Torito Fresh vende y distribuye agua en bidones de 20 L para hogares, oficinas y negocios.',
  icons: { icon: '/landing/assets/favicon.jpg' },
  openGraph: {
    title: 'Agua Torito Fresh | Agua en bidones a domicilio',
    description:
      'Bidones de agua de 20 L para tu hogar, oficina o negocio. Pide por WhatsApp y recibe tu agua a domicilio.',
    type: 'website',
    images: ['/landing/assets/torito-sin-fondo.png'],
  },
  twitter: { card: 'summary' },
};

function contenidoLanding() {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'public', 'landing', 'index.html'),
    'utf8',
  );
  const body = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];

  if (!body) throw new Error('No se encontró el contenido de la landing page.');

  return body
    .replace(/<script\b[^>]*src=["']\.\/js\/script\.js["'][^>]*><\/script>/gi, '')
    .replaceAll('./assets/', '/landing/assets/');
}

export default function Home() {
  return (
    <>
      <link rel="stylesheet" href="/landing/css/style.css" />
      <div className="landing-document" dangerouslySetInnerHTML={{ __html: contenidoLanding() }} />
      <LandingBehavior />
    </>
  );
}
