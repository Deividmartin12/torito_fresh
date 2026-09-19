'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getUnidadesVisibles, UnidadOpcion } from '../lib/unidades';
import { useSesion } from '../lib/useCurrentUser';

/**
 * Qué unidades de negocio está mirando el usuario, para toda la app.
 *
 * La elección vive en la base (Configuración › Unidades que veo), no en el navegador: es una
 * preferencia de la persona y tiene que seguirla al celular o a otra computadora. El API la lee
 * solo, así que acá no hace falta mandarla en cada petición — esto es únicamente para mostrarla
 * y para saber cuándo hay que recargar las pantallas.
 */
type UnidadContexto = {
  /** `true` cuando no eligió ninguna en particular: ve el negocio completo. */
  todas: boolean;
  /** Las que eligió. Vacío cuando `todas`. */
  elegidas: UnidadOpcion[];
  /** Todas las que podría elegir. */
  disponibles: UnidadOpcion[];
  /** Cómo se nombra lo que está viendo: "Todas las unidades", "Principal", "2 unidades". */
  resumen: string;
  /**
   * Cambia cuando cambia la selección. Las pantallas la usan como dependencia para volver a
   * pedir sus datos, y `AppShell` la usa de `key` para remontar.
   */
  clave: string;
  /**
   * Si lo que se está mirando lleva inventario. Solo es `false` cuando se mira UNA unidad que
   * no lo lleva: con varias, basta con que una lo lleve para que las pantallas tengan sentido.
   */
  controlaInventario: boolean;
  /** Vuelve a leer la preferencia. La llama la pantalla de Configuración al guardar. */
  recargar: () => Promise<void>;
};

const Contexto = createContext<UnidadContexto | null>(null);

export function useUnidad(): UnidadContexto {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useUnidad debe usarse dentro de <UnidadProvider>');
  return valor;
}

export function UnidadProvider({ children }: { children: ReactNode }) {
  const sesion = useSesion();
  const [todas, setTodas] = useState(true);
  const [ids, setIds] = useState<string[]>([]);
  const [disponibles, setDisponibles] = useState<UnidadOpcion[]>([]);

  const recargar = useCallback(async () => {
    try {
      const visibles = await getUnidadesVisibles();
      setTodas(visibles.todas);
      setIds(visibles.unidades);
      setDisponibles(visibles.disponibles);
    } catch {
      // Sin respuesta se deja lo que había: la app sigue funcionando y el API igual resuelve
      // el alcance por su cuenta, que es la única fuente que manda.
    }
  }, []);

  useEffect(() => {
    if (!sesion) return;
    void recargar();
  }, [sesion, recargar]);

  const elegidas = useMemo(
    () => (todas ? [] : disponibles.filter((unidad) => ids.includes(unidad.id))),
    [todas, ids, disponibles],
  );

  const resumen = todas
    ? disponibles.length > 1
      ? 'Todas las unidades'
      : (disponibles[0]?.nombre ?? '')
    : elegidas.length === 1
      ? elegidas[0].nombre
      : `${elegidas.length} unidades`;

  // Una sola unidad sin inventario es el único caso donde las pantallas de stock sobran. Con
  // varias, o mientras carga, se muestran: esconderlas y volver a mostrarlas parpadea feo.
  const controlaInventario = elegidas.length === 1 ? elegidas[0].controlaInventario : true;

  const clave = todas ? 'todas' : [...ids].sort().join(',');

  return (
    <Contexto.Provider
      value={{ todas, elegidas, disponibles, resumen, clave, controlaInventario, recargar }}
    >
      {children}
    </Contexto.Provider>
  );
}
