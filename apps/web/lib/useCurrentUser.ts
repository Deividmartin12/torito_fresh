'use client';

import { useEffect, useState } from 'react';
import { obtenerUsuarioGuardado, UsuarioSesion } from './api';

/**
 * La sesión guardada. Es `null` durante el primer render porque vive en localStorage y ahí
 * todavía no se leyó; los consumidores deben tratar `null` como "aún no se sabe" y mostrar
 * un cargando.
 *
 * Nota: si no hay sesión, `AppShell` ya redirige al login antes de montar la pantalla, así
 * que este `null` solo dura ese primer instante.
 */
export function useSesion(): UsuarioSesion | null {
  const [sesion, setSesion] = useState<UsuarioSesion | null>(null);
  useEffect(() => setSesion(obtenerUsuarioGuardado()), []);
  return sesion;
}

/**
 * Los permisos del usuario actual, o `null` mientras no se sabe.
 *
 * Es lo que reemplazó a `useRole()`: preguntar por el rol era lo que dejaba afuera a
 * cualquier rol creado desde el panel, porque las pantallas comparaban contra los cinco
 * nombres que existían cuando se escribieron.
 */
export function usePermisos(): string[] | null {
  const sesion = useSesion();
  return sesion ? (sesion.permisos ?? []) : null;
}
