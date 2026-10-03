'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { puede } from '../lib/permissions';
import { getMisUnidades, getUnidadesVisibles, UnidadOpcion } from '../lib/unidades';
import { useSesion } from '../lib/useCurrentUser';
import { QueryProvider } from './QueryProvider';

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
  const puedeElegir =
    sesion?.administradorPrincipal === true && puede(sesion?.permisos, 'unidades.elegir');
  const usuarioId = sesion?.id;
  const propiaId = sesion?.unidadNegocioId;
  const [todas, setTodas] = useState(true);
  const [ids, setIds] = useState<string[]>([]);
  const [disponibles, setDisponibles] = useState<UnidadOpcion[]>([]);
  const revision = useRef(0);

  const recargar = useCallback(async () => {
    const peticion = ++revision.current;
    try {
      // La preferencia de "qué unidades miro" solo existe para quien puede elegir unidad; al
      // resto el API le niega ese endpoint, y pedirlo igual dejaba un 403 en la consola en
      // cada pantalla. Su unidad sale de `/unidades/mias`, que sí les corresponde.
      if (!puedeElegir) {
        const propias = await getMisUnidades();
        if (peticion !== revision.current) return;
        setTodas(false);
        setIds(propias.map((unidad) => unidad.id));
        setDisponibles(propias);
        return;
      }
      const visibles = await getUnidadesVisibles();
      if (peticion !== revision.current) return;
      setTodas(visibles.todas);
      setIds(visibles.unidades);
      setDisponibles(visibles.disponibles);
    } catch {
      // Sin respuesta se deja lo que había: la app sigue funcionando y el API igual resuelve
      // el alcance por su cuenta, que es la única fuente que manda.
    }
  }, [puedeElegir, usuarioId, propiaId]);

  useEffect(() => {
    if (!sesion) return;
    void recargar();
    return () => {
      revision.current += 1;
    };
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
      : elegidas.length === 0
        ? (sesion?.unidad ?? '')
        : `${elegidas.length} unidades`;

  const controlaInventario =
    !puedeElegir && sesion?.controlaInventario === false
      ? false
      : elegidas.length === 1
        ? elegidas[0].controlaInventario
        : disponibles.length === 1
          ? disponibles[0].controlaInventario
          : true;

  const alcance = puedeElegir
    ? todas
      ? 'todas'
      : [...ids].sort().join(',')
    : (propiaId ?? ids[0] ?? 'sin-unidad');
  const clave = `${usuarioId ?? 'sin-sesion'}:${alcance}:${controlaInventario}`;
  const claveCache = `${clave}:${[...(sesion?.permisos ?? [])].sort().join(',')}`;

  return (
    <Contexto.Provider
      value={{ todas, elegidas, disponibles, resumen, clave, controlaInventario, recargar }}
    >
      <QueryProvider key={claveCache}>{children}</QueryProvider>
    </Contexto.Provider>
  );
}
