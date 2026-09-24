'use client';

import { Ban, TriangleAlert } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { moneda } from '../../lib/format';
import { OperationalPaymentMethod, OperationalReturn, Sale, annulSale } from '../../lib/operations';
import { SearchableSelect } from '../SearchableSelect';
import { Button } from '../ui/Button';
import { controlClass, fieldLabelClass, modalActionsClass, modalFormClass } from '../ui/Field';
import { Modal, ModalHeader } from '../ui/Modal';

type Props = {
  venta: Sale;
  metodos: OperationalPaymentMethod[];
  onClose: () => void;
  onDone: (devolucion: OperationalReturn) => void;
};

/**
 * Anular una venta. Es irreversible, así que la pantalla dice antes de tocar nada qué va a
 * pasar con las tres cosas que se mueven: la mercadería, la plata y los envases.
 */
export function AnnulSaleModal({ venta, metodos, onClose, onDone }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const [motivo, setMotivo] = useState('');
  // Se precarga el método con el que se cobró la venta, que es lo más probable, pero se puede
  // cambiar: si cobraste por Yape y le devolviste efectivo, lo que importa es de dónde salió
  // la plata de verdad, porque es lo que va a figurar en la caja del día.
  const [metodoId, setMetodoId] = useState(venta.pagosIniciales[0]?.metodoPagoId ?? '');
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

  const devuelve = venta.pagado > 0;

  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (!motivo.trim()) {
      toast.error('Escribe por qué se anula la venta.');
      return;
    }
    setSaving(true);
    try {
      const devolucion = await annulSale(venta.id, {
        motivo: motivo.trim(),
        metodoPagoId: devuelve && metodoId ? Number(metodoId) : undefined,
        observaciones: observaciones.trim() || undefined,
      });
      toast.success(`Venta ${venta.codigo} anulada`);
      onDone(devolucion);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo anular la venta');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal ref={dialogRef} onClose={onClose} closeDisabled={saving}>
      <ModalHeader
        title={`Anular la venta ${venta.codigo}`}
        subtitle={`${venta.cliente} · ${moneda(venta.total)}`}
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
              Los {venta.items.reduce((suma, item) => suma + item.cantidad, 0)} productos vuelven al
              inventario como disponibles, con su movimiento en el kardex.
            </li>
            {devuelve ? (
              <li>
                Salen <strong>{moneda(venta.pagado)}</strong> de la caja: se entiende que se los
                devuelves al cliente en efectivo, en el momento. No le queda saldo a favor.
              </li>
            ) : (
              <li>No hay plata que devolver: esta venta no llegó a cobrarse.</li>
            )}
            {venta.saldo > 0 ? (
              <li>
                Se cancela su deuda de <strong>{moneda(venta.saldo)}</strong>.
              </li>
            ) : null}
            {venta.envasesEntregados > 0 ? (
              <li>El cliente deja de deber los {venta.envasesEntregados} envases de esta venta.</li>
            ) : null}
          </ul>
        </div>

        <label>
          <span className={fieldLabelClass}>Motivo</span>
          <input
            className={controlClass}
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Por qué se anula (se guarda con la anulación)"
            maxLength={300}
            autoFocus
            required
          />
        </label>

        {devuelve ? (
          <label>
            <span className={fieldLabelClass}>Por dónde se devolvió la plata</span>
            <SearchableSelect
              value={metodoId}
              onChange={setMetodoId}
              options={metodos.map((metodo) => ({ value: metodo.id, label: metodo.nombre }))}
              placeholder="Buscar método"
            />
            <small className="auto-note">
              Si lo dejas vacío, se devuelve por los mismos métodos con los que se cobró.
            </small>
          </label>
        ) : null}

        <label>
          <span className={fieldLabelClass}>Observaciones (opcional)</span>
          <input
            className={controlClass}
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
            maxLength={300}
          />
        </label>

        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="danger" type="submit" disabled={saving}>
            <Ban size={16} aria-hidden="true" />
            {saving ? 'Anulando...' : 'Anular la venta'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
