'use client';

import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { createPaymentMethodCategory, PaymentMethodCategory } from '../lib/payment-methods';
import { Button } from './ui/Button';
import {
  checkboxFieldClass,
  checkboxInputClass,
  controlClass,
  fieldLabelClass,
  fieldWideClass,
  modalActionsClass,
  modalFormClass,
} from './ui/Field';
import { Modal, ModalHeader } from './ui/Modal';

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
    <Modal onClose={onClose} closeDisabled={saving}>
      <ModalHeader title="Agregar categoría" onClose={onClose} closeDisabled={saving} />
      <form className={modalFormClass} onSubmit={(event) => void guardar(event)}>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Nombre</span>
          <input
            className={controlClass}
            value={nombre}
            maxLength={50}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Ej. YAPE, PLIN, TRANSFERENCIA"
            required
            autoFocus
          />
        </label>
        <label className={`${checkboxFieldClass} ${fieldWideClass}`}>
          <input
            className={checkboxInputClass}
            type="checkbox"
            checked={requiereReferencia}
            onChange={(event) => setRequiereReferencia(event.target.checked)}
          />
          <span className="text-[13px] font-medium">
            Pide una referencia (número de Yape, cuenta, etc.)
          </span>
        </label>
        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button disabled={saving}>{saving ? 'Registrando...' : 'Registrar categoría'}</Button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
