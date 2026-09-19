'use client';

import { Search, X } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { createRol, GrupoPermisos, Rol, updateRol } from '../lib/roles';
import { validarNombreLibre } from '../lib/validacion';

type Props = {
  /** Los permisos que existen, agrupados como el menú lateral. */
  catalogo: GrupoPermisos[];
  editando?: Rol | null;
  onClose: () => void;
  onSaved: (rol: Rol) => void;
};

/**
 * Alta y edición de un rol: su nombre, para qué es, y qué permisos tiene.
 *
 * Los permisos van agrupados igual que el menú lateral a propósito: quien arma un rol piensa
 * en "que pueda hacer lo de Ventas", no en claves sueltas. Cada grupo tiene su "Marcar todo",
 * que es lo que hace usable una lista de más de cuarenta casillas.
 */
export function RolFormModal({ catalogo, editando, onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState(editando?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(editando?.descripcion ?? '');
  const [buscar, setBuscar] = useState('');
  const [permisos, setPermisos] = useState<Set<string>>(new Set(editando?.permisos ?? []));
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Un rol con acceso total no tiene nada que marcar: lo puede todo por definición, incluidos
  // los permisos que se agreguen mañana. Se muestran las casillas llenas y apagadas para que
  // se vea qué alcanza, en vez de una pantalla en blanco que parecería un error.
  const soloLectura = Boolean(editando?.accesoTotal);

  const grupos = useMemo(() => {
    const term = buscar.trim().toLowerCase();
    if (!term) return catalogo;
    return catalogo
      .map((grupo) => ({
        ...grupo,
        permisos: grupo.permisos.filter((permiso) =>
          `${permiso.etiqueta} ${permiso.descripcion} ${grupo.grupo}`.toLowerCase().includes(term),
        ),
      }))
      .filter((grupo) => grupo.permisos.length > 0);
  }, [buscar, catalogo]);

  const totalPermisos = useMemo(
    () => catalogo.reduce((suma, grupo) => suma + grupo.permisos.length, 0),
    [catalogo],
  );

  function alternar(clave: string) {
    setPermisos((actuales) => {
      const siguiente = new Set(actuales);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  function alternarGrupo(grupo: GrupoPermisos, marcar: boolean) {
    setPermisos((actuales) => {
      const siguiente = new Set(actuales);
      for (const permiso of grupo.permisos) {
        if (marcar) siguiente.add(permiso.clave);
        else siguiente.delete(permiso.clave);
      }
      return siguiente;
    });
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mensaje = validarNombreLibre(nombre, 'el nombre del rol');
    if (mensaje) {
      setError(mensaje);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        permisos: [...permisos],
      };
      const saved = editando ? await updateRol(editando.id, payload) : await createRol(payload);
      toast.success(editando ? 'Rol actualizado.' : 'Rol creado.');
      onSaved(saved);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar el rol');
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  const titulo = editando ? `Editar ${editando.nombre}` : 'Crear rol';

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section className="crud-modal rol-modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-top">
          <h2>{titulo}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar modal"
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>
        <form className="modal-form" onSubmit={(event) => void guardar(event)} noValidate>
          <label className="field-wide">
            <span>Nombre del rol</span>
            <input
              value={nombre}
              onChange={(event) => {
                setNombre(event.target.value);
                setError(undefined);
              }}
              maxLength={60}
              placeholder="Supervisor de planta"
              required
              autoFocus
            />
            {error ? <small className="field-error">{error}</small> : null}
          </label>

          <label className="field-wide">
            <span>Para qué es</span>
            <input
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              maxLength={250}
              placeholder="Revisa la producción del turno y cierra los lotes"
            />
          </label>

          {soloLectura ? (
            <p className="form-hint field-wide">
              Este rol tiene <strong>acceso total</strong>: puede hacer todo lo que existe hoy y
              todo lo que se agregue más adelante. Por eso sus permisos no se marcan uno por uno. Si
              necesitas un rol más acotado, crea uno nuevo.
            </p>
          ) : (
            <>
              <div className="field-wide rol-permisos-head">
                <span className="modal-form-label">
                  Permisos · {permisos.size} de {totalPermisos}
                </span>
                <label className="pill-search rol-permisos-buscar">
                  <Search size={15} />
                  <input
                    value={buscar}
                    onChange={(event) => setBuscar(event.target.value)}
                    placeholder="Buscar un permiso"
                  />
                </label>
              </div>

              <div className="field-wide rol-permisos">
                {grupos.map((grupo) => {
                  const marcados = grupo.permisos.filter((permiso) =>
                    permisos.has(permiso.clave),
                  ).length;
                  const todos = marcados === grupo.permisos.length;
                  return (
                    <section className="rol-permiso-grupo" key={grupo.grupo}>
                      <header>
                        <strong>{grupo.grupo}</strong>
                        <button
                          type="button"
                          className="rol-permiso-todos"
                          onClick={() => alternarGrupo(grupo, !todos)}
                          disabled={saving}
                        >
                          {todos ? 'Quitar todo' : 'Marcar todo'}
                        </button>
                        <small>
                          {marcados} de {grupo.permisos.length}
                        </small>
                      </header>
                      {grupo.permisos.map((permiso) => (
                        <label className="rol-permiso" key={permiso.clave}>
                          <input
                            type="checkbox"
                            checked={permisos.has(permiso.clave)}
                            onChange={() => alternar(permiso.clave)}
                            disabled={saving}
                          />
                          <span>
                            <strong>{permiso.etiqueta}</strong>
                            <small>{permiso.descripcion}</small>
                          </span>
                        </label>
                      ))}
                    </section>
                  );
                })}
                {grupos.length === 0 ? (
                  <div className="table-empty">
                    <Search size={22} />
                    <span>Ningún permiso coincide con “{buscar}”.</span>
                  </div>
                ) : null}
              </div>

              {permisos.size === 0 ? (
                <p className="form-hint field-wide">
                  Sin ningún permiso marcado, quien tenga este rol entra pero no ve ninguna
                  pantalla. Marca al menos “Ver el resumen”.
                </p>
              ) : null}
            </>
          )}

          <div className="modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear rol'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
