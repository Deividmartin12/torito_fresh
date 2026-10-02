'use client';

import { Ban, TriangleAlert } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { moneda } from '../../lib/format';
import { Expense, annulExpense } from '../../lib/expenses';
import { Button } from '../ui/Button';
import { controlClass, fieldLabelClass, modalActionsClass, modalFormClass } from '../ui/Field';
import { Modal, ModalHeader } from '../ui/Modal';

type Props = {
  gasto: Expense;
  onClose: () => void;
  onDone: (gasto: Expense) => void;
};

/**
 * Revertir un gasto. Es irreversible: el monto deja de restar en reportes y caja, pero la
 * fila queda con motivo, autor y fecha para auditoría. No mueve stock ni envases.
 */
export function AnnulExpenseModal({ gasto, onClose, onDone }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const [motivo, setMotivo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, saving]);

  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (!motivo.trim()) {
      toast.error('Escribe por qué se revierte el gasto.');
      return;
    }
    setSaving(true);
    try {
      const revertido = await annulExpense(gasto.id, {
        motivo: motivo.trim(),
        observaciones: observaciones.trim() || undefined,
      });
      toast.success('Gasto revertido');
      onDone(revertido);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo revertir el gasto');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal ref={dialogRef} onClose={onClose} closeDisabled={saving}>
      <ModalHeader
        title="Revertir gasto"
        subtitle={`${gasto.categoria} · ${moneda(gasto.monto)}`}
        onClose={onClose}
        closeDisabled={saving}
      />

      <form className={modalFormClass} onSubmit={guardar}>
        <div className="annul-summary">
          <p className="annul-warning">
            <TriangleAlert size={16} aria-hidden="true" />
            <span>Esto no se puede deshacer.</span>
          </p>
          <ul>
            <li>
              El gasto de <strong>{moneda(gasto.monto)}</strong>
              {gasto.concepto ? ` (${gasto.concepto})` : ''} dejará de restar en reportes y caja.
            </li>
            <li>Queda guardado quién lo revirtió y por qué, para auditoría.</li>
          </ul>
        </div>

        <label>
          <span className={fieldLabelClass}>Motivo</span>
          <input
            className={controlClass}
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Por qué se revierte (se guarda con la reversión)"
            maxLength={300}
            autoFocus
            required
          />
        </label>

        <label>
          <span className={fieldLabelClass}>Observaciones (opcional)</span>
          <input
            className={controlClass}
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
            maxLength={500}
          />
        </label>

        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="danger" type="submit" disabled={saving}>
            <Ban size={16} aria-hidden="true" />
            {saving ? 'Revirtiendo...' : 'Revertir gasto'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
