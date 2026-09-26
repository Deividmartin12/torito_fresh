import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import path from 'node:path';

export default (phase: string): NextConfig => ({
  reactStrictMode: true,
  // Evita que `next build` sobrescriba los chunks de un `next dev` activo.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  // El servidor autónomo incluye únicamente los archivos requeridos en ejecución y permite
  // una imagen Docker final mucho más pequeña que el árbol completo de dependencias.
  output: 'standalone',
});
