'use client';

import { X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  createPaymentMethodCategory,
  PaymentMethodCategory,
} from '../lib/payment-methods';

type Props = {
  onClose: () => void;
  onSaved: (categoria: PaymentMethodCategory) => void;
};

/**
 * Alta de una categoría de método de pago (YAPE, PLIN, TRANSFERENCIA...) como acción inline
 * "+ Agregar categoría" desde el combo del formulario de método de pago.
 */
export function PaymentMethodCategoryFormModal({ onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState('');
  const [requiereReferencia, setRequiereReferencia] = useState(true);
  const [saving, setSaving] = useState(false);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await createPaymentMethodCategory({ nombre, requiereReferencia });
      toast.success('Categoría registrada.');
      onSaved(saved);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar la categoría');
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
        aria-label="Agregar categoría de método de pago"
      >
        <div className="modal-top">
          <h2>Agregar categoría</h2>
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
              placeholder="Ej. YAPE, PLIN, TRANSFERENCIA"
              required
              autoFocus
            />
          </label>
          <label className="check-field field-wide">
            <input
              type="checkbox"
              checked={requiereReferencia}
              onChange={(event) => setRequiereReferencia(event.target.checked)}
            />
            <span>Pide una referencia (número de Yape, cuenta, etc.)</span>
          </label>
          <div className="modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar categoría'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
