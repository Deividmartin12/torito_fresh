'use client';

import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
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
    <Modal onClose={onClose} closeDisabled={saving}>
      <ModalHeader title="Agregar almacén" onClose={onClose} closeDisabled={saving} />
      <form className={modalFormClass} onSubmit={(event) => void guardar(event)} noValidate>
        <label>
          <span className={fieldLabelClass}>Nombre</span>
          <input
            className={controlClass}
            value={nombre}
            onChange={(event) => {
              setNombre(soloTextoNombre(event.target.value));
              setError(undefined);
            }}
            maxLength={80}
            required
            autoFocus
          />
          {error ? <small className={fieldErrorClass}>{error}</small> : null}
        </label>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Dirección</span>
          <input
            className={controlClass}
            value={direccion}
            onChange={(event) => setDireccion(event.target.value)}
            maxLength={250}
          />
        </label>
        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button disabled={saving}>{saving ? 'Registrando...' : 'Registrar almacén'}</Button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
