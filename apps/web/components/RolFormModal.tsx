'use client';

import { Search } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { createRol, GrupoPermisos, Rol, updateRol } from '../lib/roles';
import { Button } from './ui/Button';
import {
  controlClass,
  fieldErrorClass,
  fieldLabelClass,
  fieldWideClass,
  formHintClass,
  modalActionsClass,
  modalFormClass,
} from './ui/Field';
import { Modal, ModalHeader } from './ui/Modal';
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

  /** Qué arrastra cada permiso, por clave. Lo declara el catálogo que manda el API. */
  const implicaciones = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const grupo of catalogo) {
      for (const permiso of grupo.permisos) mapa.set(permiso.clave, permiso.implica ?? []);
    }
    return mapa;
  }, [catalogo]);

  /**
   * Marca el permiso y todo lo que arrastra.
   *
   * El API hace lo mismo al guardar; acá se adelanta para que las casillas que se van a
   * guardar se vean marcadas antes de apretar el botón, y no aparezcan después como una
   * sorpresa al volver a abrir el rol.
   */
  function marcarCon(actuales: Set<string>, clave: string) {
    const pendientes = [clave];
    while (pendientes.length) {
      const actual = pendientes.pop() as string;
      if (actuales.has(actual)) continue;
      actuales.add(actual);
      pendientes.push(...(implicaciones.get(actual) ?? []));
    }
  }

  function alternar(clave: string) {
    setPermisos((actuales) => {
      const siguiente = new Set(actuales);
      // Al desmarcar se quita solo el permiso tocado: lo que arrastraba puede estar ahí
      // porque alguien lo marcó por su cuenta, y quitárselo sin avisar sería peor.
      if (siguiente.has(clave)) siguiente.delete(clave);
      else marcarCon(siguiente, clave);
      return siguiente;
    });
  }

  function alternarGrupo(grupo: GrupoPermisos, marcar: boolean) {
    setPermisos((actuales) => {
      const siguiente = new Set(actuales);
      for (const permiso of grupo.permisos) {
        if (marcar) marcarCon(siguiente, permiso.clave);
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
    <Modal onClose={onClose} closeDisabled={saving} className="max-w-[820px]">
      <ModalHeader title={titulo} onClose={onClose} closeDisabled={saving} />
      <form className={modalFormClass} onSubmit={(event) => void guardar(event)} noValidate>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Nombre del rol</span>
          <input
            className={controlClass}
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
          {error ? <small className={fieldErrorClass}>{error}</small> : null}
        </label>

        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Para qué es</span>
          <input
            className={controlClass}
            value={descripcion}
            onChange={(event) => setDescripcion(event.target.value)}
            maxLength={250}
            placeholder="Revisa la producción del turno y cierra los lotes"
          />
        </label>

        {soloLectura ? (
          <p className={`${formHintClass} ${fieldWideClass}`}>
            Este rol tiene <strong>acceso total</strong>: puede hacer todo lo que existe hoy y todo
            lo que se agregue más adelante. Por eso sus permisos no se marcan uno por uno. Si
            necesitas un rol más acotado, crea uno nuevo.
          </p>
        ) : (
          <>
            <div className={`rol-permisos-head ${fieldWideClass}`}>
              <span className={fieldLabelClass}>
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

            <div className={`rol-permisos ${fieldWideClass}`}>
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
              <p className={`${formHintClass} ${fieldWideClass}`}>
                Sin ningún permiso marcado, quien tenga este rol entra pero no ve ninguna pantalla.
                Marca al menos “Ver el resumen”.
              </p>
            ) : null}
          </>
        )}

        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button disabled={saving}>
            {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear rol'}
          </Button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
