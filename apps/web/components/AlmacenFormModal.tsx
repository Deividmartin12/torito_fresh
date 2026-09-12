'use client';

import { X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { soloTextoNombre, validarNombreLibre } from '../lib/validacion';

/** Lo que devuelve `POST /operations/warehouses`. */
export type AlmacenCreado = {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string;
  activo: boolean;
};

type Props = {
  onClose: () => void;
  onSaved: (almacen: AlmacenCreado) => void;
};

/**
 * Alta de almacén como acción inline "+ Agregar almacén" desde el combo del formulario de venta.
 * Solo crea; la edición vive en la pantalla de Almacenes.
 */
export function AlmacenFormModal({ onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errorNombre = validarNombreLibre(nombre, 'el nombre del almacén');
    if (errorNombre) {
      setError(errorNombre);
      return;
    }
    setSaving(true);
    try {
      const saved = await api<AlmacenCreado>('/operations/warehouses', {
        method: 'POST',
        body: JSON.stringify({ nombre: nombre.trim(), direccion: direccion.trim() || undefined }),
      });
      toast.success('Almacén registrado.');
      onSaved(saved);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar el almacén');
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section className="crud-modal" role="dialog" aria-modal="true" aria-label="Agregar almacén">
        <div className="modal-top">
          <h2>Agregar almacén</h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>
        <form className="modal-form" onSubmit={(event) => void guardar(event)} noValidate>
          <label>
            <span>Nombre</span>
            <input
              value={nombre}
              onChange={(event) => {
                setNombre(soloTextoNombre(event.target.value));
                setError(undefined);
              }}
              maxLength={80}
              required
              autoFocus
            />
            {error ? <small className="field-error">{error}</small> : null}
          </label>
          <label className="field-wide">
            <span>Dirección</span>
            <input
              value={direccion}
              onChange={(event) => setDireccion(event.target.value)}
              maxLength={250}
            />
          </label>
          <div className="modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar almacén'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
