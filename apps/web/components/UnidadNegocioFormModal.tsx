'use client';

import { X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { createUnidad, UnidadNegocio, updateUnidad } from '../lib/unidades';
import { validarNombreLibre } from '../lib/validacion';
import { Segmented } from './Segmented';

type Props = {
  editando?: UnidadNegocio | null;
  onClose: () => void;
  onSaved: (unidad: UnidadNegocio) => void;
};

const CON_INVENTARIO = 'inventario';
const SOLO_REGISTRO = 'registro';

/**
 * Alta / edición de una unidad de negocio. La usan la pantalla de Unidades y, como acción
 * inline "+ Agregar unidad", el combo de unidad del formulario de trabajador.
 */
export function UnidadNegocioFormModal({ editando, onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState(editando?.nombre ?? '');
  const [modo, setModo] = useState(
    editando && !editando.controlaInventario ? SOLO_REGISTRO : CON_INVENTARIO,
  );
  // Solo aplica al alta: si la unidad ya existe, sus almacenes se manejan desde Almacenes.
  const [crearAlmacen, setCrearAlmacen] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const controlaInventario = modo === CON_INVENTARIO;
  // El modo define cómo se guardan las ventas, así que dejar de cambiarlo con ventas hechas no
  // es una restricción de la pantalla: el API lo rechaza igual. Acá se explica antes.
  const modoBloqueado = Boolean(editando && editando.ventas > 0);
  const principal = Boolean(editando?.principal);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mensaje = validarNombreLibre(nombre, 'el nombre de la unidad');
    if (mensaje) {
      setError(mensaje);
      return;
    }
    setSaving(true);
    try {
      const saved = editando
        ? await updateUnidad(editando.id, {
            nombre: nombre.trim(),
            ...(modoBloqueado || principal ? {} : { controlaInventario }),
          })
        : await createUnidad({
            nombre: nombre.trim(),
            controlaInventario,
            // En una unidad que solo registra ventas y gastos el almacén se crea igual: es el
            // ancla contable de la venta, no algo que el usuario administre.
            ...(controlaInventario ? { crearAlmacen } : {}),
          });
      toast.success(editando ? 'Unidad actualizada.' : 'Unidad de negocio registrada.');
      onSaved(saved);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar la unidad');
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  const titulo = editando ? 'Editar unidad de negocio' : 'Agregar unidad de negocio';

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section className="crud-modal" role="dialog" aria-modal="true" aria-label={titulo}>
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
            <span>Nombre</span>
            <input
              value={nombre}
              onChange={(event) => {
                setNombre(event.target.value);
                setError(undefined);
              }}
              maxLength={100}
              placeholder="Puesto de Juan"
              required
              autoFocus
            />
            {error ? <small className="field-error">{error}</small> : null}
          </label>

          {/* Qué hace la unidad. Es la decisión más importante del alta: define si sus ventas
              descuentan stock, y por eso después no se puede cambiar si ya vendió. */}
          <div className="field-wide">
            <span className="modal-form-label">Qué hace esta unidad</span>
            <Segmented
              options={[
                {
                  value: CON_INVENTARIO,
                  label: 'Produce y lleva inventario',
                  disabled: saving || modoBloqueado,
                },
                {
                  value: SOLO_REGISTRO,
                  label: 'Solo ventas y gastos',
                  disabled: saving || modoBloqueado || principal,
                },
              ]}
              value={modo}
              onChange={setModo}
              ariaLabel="Qué hace esta unidad"
            />
          </div>

          {principal ? (
            <p className="form-hint field-wide">
              La unidad principal siempre lleva inventario: es la que produce, y de su almacén sale
              el stock de todo el negocio.
            </p>
          ) : modoBloqueado ? (
            <p className="form-hint field-wide">
              Esta unidad ya tiene ventas registradas, así que su modo no se puede cambiar: sus
              ventas viejas y las nuevas se guardarían de formas distintas. Si necesitas el otro
              modo, crea una unidad nueva.
            </p>
          ) : controlaInventario ? (
            <>
              {editando ? null : (
                <label className="checkbox-field field-wide">
                  <input
                    type="checkbox"
                    checked={crearAlmacen}
                    onChange={(event) => setCrearAlmacen(event.target.checked)}
                  />
                  <span>Crear un almacén para esta unidad</span>
                </label>
              )}
              <p className="form-hint field-wide">
                Sus ventas descuentan stock de su propio almacén y quedan en el kardex. Sin almacén
                propio no puede registrar ventas: el descuento no tendría de dónde salir.
              </p>
            </>
          ) : (
            <p className="form-hint field-wide">
              Registra lo que vende y lo que gasta, nada más. Sus ventas no descuentan stock ni
              generan kardex, y no verá Producción, Lotes, Almacenes ni Kardex. La utilidad se
              estima con el costo de referencia de cada producto.
            </p>
          )}

          {editando ? (
            <p className="form-hint field-wide">
              Las ventas y los gastos ya registrados conservan su unidad. Cambiar el nombre no mueve
              nada de sitio.
            </p>
          ) : null}

          <div className="modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar unidad'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
