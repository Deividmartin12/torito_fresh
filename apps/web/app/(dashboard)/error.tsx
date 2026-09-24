'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Button, buttonClass } from '../../components/ui/Button';

/**
 * Red de contención para el panel: si una pantalla de `(dashboard)` tira una excepción al
 * renderizar, esto se muestra en vez de una página en blanco.
 *
 * Reemplaza también el layout del grupo (el sidebar incluido), así que el link a "/dashboard"
 * es la única salida mientras se ve este error — sin él quedaría sin forma de navegar.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Deja rastro en la consola (y en cualquier servicio que la capture) sin tragarse el error.
    console.error(error);
  }, [error]);

  return (
    <div className="module-page">
      <div className="empty-state">
        <AlertTriangle size={34} />
        <h2>Algo salió mal</h2>
        <p>
          Esta pantalla tuvo un error inesperado. Podés reintentar o volver al inicio; si sigue
          pasando, avisale al administrador.
        </p>
        <div className="flex flex-wrap gap-[7px]">
          <Button type="button" onClick={reset}>
            Reintentar
          </Button>
          <Link className={buttonClass('secondary')} href="/dashboard">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
