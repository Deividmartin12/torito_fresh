'use client';

import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  createPaymentMethodCategory,
  PaymentMethodCategory,
  updatePaymentMethodCategory,
} from '../lib/payment-methods';
import { soloTextoNombre, validarNombreLibre } from '../lib/validacion';
import { Button } from './ui/Button';
import {
  checkboxFieldClass,
  checkboxInputClass,
  controlClass,
  fieldErrorClass,
  fieldLabelClass,
  fieldWideClass,
  modalActionsClass,
  modalFormClass,
} from './ui/Field';
import { Modal, ModalHeader } from './ui/Modal';

type Props = {
  editando?: PaymentMethodCategory | null;
  onClose: () => void;
  onSaved: (categoria: PaymentMethodCategory) => void;
};

/**
 * Alta de una categoría de método de pago (YAPE, PLIN, TRANSFERENCIA...) como acción inline
 * "+ Agregar categoría" desde el combo del formulario de método de pago.
 */
export function PaymentMethodCategoryFormModal({ editando, onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState(editando?.nombre ?? '');
  const [requiereReferencia, setRequiereReferencia] = useState(
    editando?.requiereReferencia ?? true,
  );
  const [estado, setEstado] = useState(editando?.estado ?? true);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errorNombre = validarNombreLibre(nombre, 'el nombre de la categoría');
    if (errorNombre) {
      setError(errorNombre);
      return;
    }
    setSaving(true);
    try {
      const payload = { nombre: nombre.trim(), requiereReferencia, estado };
      const saved = editando
        ? await updatePaymentMethodCategory(editando.id, payload)
        : await createPaymentMethodCategory(payload);
      toast.success(editando ? 'Categoría actualizada.' : 'Categoría registrada.');
      onSaved(saved);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar la categoría');
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  const titulo = editando ? 'Editar categoría' : 'Agregar categoría';

  return createPortal(
    <Modal onClose={onClose} closeDisabled={saving}>
      <ModalHeader title={titulo} onClose={onClose} closeDisabled={saving} />
      <form className={modalFormClass} onSubmit={(event) => void guardar(event)} noValidate>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Nombre</span>
          <input
            className={controlClass}
            value={nombre}
            maxLength={50}
            onChange={(event) => {
              setNombre(soloTextoNombre(event.target.value));
              setError(undefined);
            }}
            placeholder="Ej. YAPE, PLIN, TRANSFERENCIA"
            required
            autoFocus
          />
          {error ? <small className={fieldErrorClass}>{error}</small> : null}
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
        {editando ? (
          <label className={`${checkboxFieldClass} ${fieldWideClass}`}>
            <input
              className={checkboxInputClass}
              type="checkbox"
              checked={estado}
              onChange={(event) => setEstado(event.target.checked)}
            />
            <span className="text-[13px] font-medium">Categoría activa</span>
          </label>
        ) : null}
        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar categoría'}
          </Button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
