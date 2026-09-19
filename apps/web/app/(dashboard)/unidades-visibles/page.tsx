'use client';

import { Building2, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useUnidad } from '../../../components/UnidadProvider';
import { guardarUnidadesVisibles, UnidadOpcion } from '../../../lib/unidades';

/**
 * Qué unidades de negocio mira esta cuenta.
 *
 * Existe porque los datos viven repartidos: con las ventas en un puesto y los gastos en otro,
 * mirar una sola unidad a la vez hacía que los reportes se vieran vacíos sin explicación. Acá
 * se eligen las que interesan y la elección queda guardada en la base, así que sigue a la
 * persona aunque entre desde otro equipo.
 */
export default function UnidadesVisiblesPage() {
  const { todas, elegidas, disponibles, recargar } = useUnidad();
  // Copia local para poder marcar y desmarcar sin guardar en cada clic.
  const [verTodas, setVerTodas] = useState(true);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setVerTodas(todas);
    setMarcadas(elegidas.map((unidad) => unidad.id));
  }, [todas, elegidas]);

  function alternar(unidad: UnidadOpcion) {
    setVerTodas(false);
    setMarcadas((actuales) =>
      actuales.includes(unidad.id)
        ? actuales.filter((id) => id !== unidad.id)
        : [...actuales, unidad.id],
    );
  }

  const sinNinguna = !verTodas && marcadas.length === 0;
  // Comparación por contenido, no por orden: marcar y desmarcar la misma casilla no cuenta.
  const sinCambios =
    verTodas === todas &&
    marcadas.length === elegidas.length &&
    marcadas.every((id) => elegidas.some((unidad) => unidad.id === id));

  async function guardar() {
    if (sinNinguna) return;
    setGuardando(true);
    try {
      // Lista vacía = todas. Se manda así a propósito: si se mandaran los ids de hoy, una
      // unidad creada mañana quedaría fuera sin que nadie se entere.
      await guardarUnidadesVisibles(verTodas ? [] : marcadas);
      await recargar();
      toast.success('Listo: ya estás viendo lo que elegiste.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar la selección');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Unidades que veo</h1>
          <span>Qué negocios entran en tus reportes y tus listados</span>
        </div>
      </div>

      <p className="report-note">
        Lo que elijas acá manda en todas las pantallas: ventas, gastos, cobranzas y reportes. Se
        guarda en tu cuenta, así que te sigue si entras desde el celular o desde otra computadora.
      </p>

      <div className="unidades-visibles-lista">
        <button
          type="button"
          className={`unidad-opcion${verTodas ? ' elegida' : ''}`}
          onClick={() => {
            setVerTodas(true);
            setMarcadas([]);
          }}
        >
          <span className="unidad-opcion-marca" aria-hidden>
            {verTodas ? <Check size={15} /> : null}
          </span>
          <span className="unidad-opcion-texto">
            <strong>Todas las unidades</strong>
            <small>
              El negocio completo, y también las unidades que crees más adelante. Es lo recomendado
              si no quieres perder de vista nada.
            </small>
          </span>
        </button>

        {disponibles.map((unidad) => {
          const marcada = !verTodas && marcadas.includes(unidad.id);
          return (
            <button
              key={unidad.id}
              type="button"
              className={`unidad-opcion${marcada ? ' elegida' : ''}`}
              onClick={() => alternar(unidad)}
            >
              <span className="unidad-opcion-marca" aria-hidden>
                {marcada ? <Check size={15} /> : null}
              </span>
              <span className="unidad-opcion-texto">
                <strong>
                  <Building2 size={14} /> {unidad.nombre}
                </strong>
                <small>
                  {unidad.codigo}
                  {unidad.principal ? ' · Principal' : ''}
                  {unidad.controlaInventario ? '' : ' · Solo ventas y gastos'}
                </small>
              </span>
            </button>
          );
        })}
      </div>

      {sinNinguna ? (
        <p className="field-error">Marca al menos una unidad, o elige "Todas las unidades".</p>
      ) : null}

      <div className="modal-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void guardar()}
          disabled={guardando || sinNinguna || sinCambios}
        >
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
