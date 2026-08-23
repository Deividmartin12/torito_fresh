import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import path from "node:path";

export default (phase: string): NextConfig => ({
  reactStrictMode: true,
  // Evita que `next build` sobrescriba los chunks de un `next dev` activo.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
});
