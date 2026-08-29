'use client';

import { useEffect, useState } from 'react';
import { getStoredUser } from './api';

/**
 * Rol del usuario actual. Es `null` durante SSR y el primer render (la sesión vive
 * en localStorage); los consumidores deben tratar `null` como "aún no se sabe".
 */
export function useRole(): string | null {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => setRole(getStoredUser()?.role ?? null), []);
  return role;
}
