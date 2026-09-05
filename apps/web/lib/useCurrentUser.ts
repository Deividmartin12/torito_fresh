'use client';

import { useEffect, useState } from 'react';
import { obtenerUsuarioGuardado } from './api';

/**
 * Rol del usuario actual. Es `null` durante el primer render porque la sesión vive en
 * localStorage y ahí todavía no se leyó; los consumidores deben tratar `null` como
 * "aún no se sabe" y mostrar un cargando.
 *
 * Nota: si no hay sesión, `AppShell` ya redirige al login antes de montar la pantalla,
 * así que este `null` solo dura ese primer instante.
 */
export function useRole(): string | null {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => setRole(obtenerUsuarioGuardado()?.role ?? null), []);
  return role;
}
