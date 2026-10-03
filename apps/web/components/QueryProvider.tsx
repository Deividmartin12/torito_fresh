'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Caché de la cuenta y el alcance actuales. UnidadProvider remonta este proveedor al
 * cambiar cualquiera de los dos, evitando reutilizar datos de otra cuenta o unidad.
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
