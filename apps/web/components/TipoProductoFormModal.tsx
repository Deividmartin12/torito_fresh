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
    <Modal onClose={onClose} closeDisabled={saving}>
      <ModalHeader title="Agregar tipo de producto" onClose={onClose} closeDisabled={saving} />
      <form className={modalFormClass} onSubmit={(event) => void guardar(event)}>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Nombre</span>
          <input
            className={controlClass}
            value={nombre}
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
          <Button disabled={saving}>{saving ? 'Registrando...' : 'Registrar tipo'}</Button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
