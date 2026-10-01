'use client';

import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { Button } from './ui/Button';
import {
  controlClass,
  fieldLabelClass,
  fieldWideClass,
  modalActionsClass,
  modalFormClass,
} from './ui/Field';
import { Modal, ModalHeader } from './ui/Modal';

/** Lo que devuelve `POST /operations/product-types`. */
export type TipoProductoCreado = { id: string; nombre: string };

type Props = {
  editando?: TipoProductoCreado | null;
  onClose: () => void;
  onSaved: (tipo: TipoProductoCreado) => void;
};

/**
 * Alta de tipo de producto como acción inline "+ Agregar tipo" desde el combo del
 * formulario de producto y alta/edición desde la sección Tipos de producto.
 */
export function TipoProductoFormModal({ editando, onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState(editando?.nombre ?? '');
  const [saving, setSaving] = useState(false);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (saving) return;
    if (!nombre.trim()) {
      toast.error('Ingresa el nombre del tipo de producto.');
      return;
    }
    setSaving(true);
    try {
      const saved = await api<TipoProductoCreado>(
        `/operations/product-types${editando ? `/${editando.id}` : ''}`,
        {
          method: editando ? 'PATCH' : 'POST',
          body: JSON.stringify({ nombre: nombre.trim() }),
        },
      );
      toast.success(editando ? 'Tipo de producto actualizado.' : 'Tipo de producto registrado.');
      onSaved(saved);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : 'No se pudo guardar el tipo de producto',
      );
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <Modal onClose={onClose} closeDisabled={saving}>
      <ModalHeader
        title={editando ? 'Editar tipo de producto' : 'Agregar tipo de producto'}
        onClose={onClose}
        closeDisabled={saving}
      />
      <form className={modalFormClass} onSubmit={(event) => void guardar(event)}>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Nombre</span>
          <input
            className={controlClass}
            value={nombre}
            disabled={saving}
            maxLength={50}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Ej. Agua, Bidón, Insumo..."
            required
            autoFocus
          />
        </label>
        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar tipo'}
          </Button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
