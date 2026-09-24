'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Un único `QueryClient` para toda la app, que cachea entre navegaciones: hoy cada pantalla
 * vuelve a pedir todo al montar (`cache: 'no-store'` en `lib/api.ts`), así que volver a
 * "/ventas" después de mirar otra pantalla repite las mismas cinco consultas.
 *
 * Se crea con `useState` (no como constante del módulo) para que cada sesión del navegador
 * tenga su propio cliente y no comparta caché con otra pestaña por accidente.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 30s: suficiente para que ir y volver entre pantallas no repita el pedido, pero
            // corto para un negocio donde las cifras cambian todo el tiempo (ventas, stock).
            staleTime: 30_000,
            // Los mensajes de `api()` ya vienen traducidos y con su propio "Reintentar" en el
            // toast de cada pantalla; tres reintentos con backoff (el default) demorarían ese
            // aviso varios segundos de más. Uno solo alcanza para un tropiezo de red pasajero.
            retry: 1,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
