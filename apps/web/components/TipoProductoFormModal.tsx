'use client';

import { X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';

/** Lo que devuelve `POST /operations/product-types`. */
export type TipoProductoCreado = { id: string; nombre: string };

type Props = {
  onClose: () => void;
  onSaved: (tipo: TipoProductoCreado) => void;
};

/**
 * Alta de tipo de producto como acción inline "+ Agregar tipo" desde el combo del
 * formulario de producto. Solo crea; no hay pantalla de gestión aparte.
 */
export function TipoProductoFormModal({ onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState('');
  const [saving, setSaving] = useState(false);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await api<TipoProductoCreado>('/operations/product-types', {
        method: 'POST',
        body: JSON.stringify({ nombre: nombre.trim() }),
      });
      toast.success('Tipo de producto registrado.');
      onSaved(saved);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : 'No se pudo registrar el tipo de producto',
      );
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
      <section
        className="crud-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Agregar tipo de producto"
      >
        <div className="modal-top">
          <h2>Agregar tipo de producto</h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>
        <form className="modal-form" onSubmit={(event) => void guardar(event)}>
          <label className="field-wide">
            <span>Nombre</span>
            <input
              value={nombre}
              maxLength={50}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Ej. Agua, Bidón, Insumo..."
              required
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar tipo'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
