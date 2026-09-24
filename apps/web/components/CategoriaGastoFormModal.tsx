'use client';

import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { createExpenseCategory, ExpenseCategory, updateExpenseCategory } from '../lib/expenses';
import { Button } from './ui/Button';
import {
  controlClass,
  fieldErrorClass,
  fieldLabelClass,
  fieldWideClass,
  modalActionsClass,
  modalFormClass,
} from './ui/Field';
import { Modal, ModalHeader } from './ui/Modal';
import { soloTextoNombre, validarNombreLibre } from '../lib/validacion';

type Props = {
  editando?: ExpenseCategory | null;
  onClose: () => void;
  onSaved: (categoria: ExpenseCategory) => void;
};

/**
 * Alta / edición de una categoría de gasto. La usan la pantalla de Categorías de gasto y,
 * como acción inline "+ Agregar categoría", el combo de categoría del formulario de gasto.
 */
export function CategoriaGastoFormModal({ editando, onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState(editando?.nombre ?? '');
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
      const saved = editando
        ? await updateExpenseCategory(editando.id, nombre.trim())
        : await createExpenseCategory(nombre.trim());
      toast.success(editando ? 'Categoría actualizada.' : 'Categoría registrada.');
      onSaved(saved);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar la categoría');
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
            maxLength={100}
            onChange={(event) => {
              setNombre(soloTextoNombre(event.target.value));
              setError(undefined);
            }}
            placeholder="Ej. Servicios"
            required
            autoFocus
          />
          {error ? <small className={fieldErrorClass}>{error}</small> : null}
        </label>
        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button disabled={saving}>
            {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar categoría'}
          </Button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
