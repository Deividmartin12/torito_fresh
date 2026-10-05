'use client';

import { Settings } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { PaymentMethod, paymentMethodOptionLabel } from '../../lib/payment-methods';
import {
  availableSaleDefault,
  getSalePreferences,
  saveSalePreferences,
} from '../../lib/sale-preferences';
import { Button } from '../ui/Button';
import {
  controlClass,
  fieldLabelClass,
  fieldWideClass,
  modalActionsClass,
  modalFormClass,
} from '../ui/Field';
import { Modal, ModalHeader } from '../ui/Modal';

export function SaleSettings({
  methods,
  onSaved,
}: {
  methods: PaymentMethod[];
  onSaved: (metodoPagoId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="mb-3 flex justify-end">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Settings size={16} aria-hidden="true" /> Ajustes de venta
      </Button>
      {open
        ? createPortal(
            <SaleSettingsModal methods={methods} onClose={close} onSaved={onSaved} />,
            document.body,
          )
        : null}
    </div>
  );
}

function SaleSettingsModal({
  methods,
  onClose,
  onSaved,
}: {
  methods: PaymentMethod[];
  onClose: () => void;
  onSaved: (metodoPagoId: string | null) => void;
}) {
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getSalePreferences()
      .then((preferences) => {
        if (active) setSelected(availableSaleDefault(methods, preferences.metodoPagoId));
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los ajustes');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [methods, retry]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => {
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!saving) onClose();
      }
      if (event.key === 'Tab') {
        const controls = panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled)',
        );
        if (!controls?.length) {
          event.preventDefault();
          return;
        }
        const first = controls[0],
          last = controls[controls.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === panel.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === panel.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [onClose, saving]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Los eventos de un portal también llegan al formulario de venta que lo contiene.
    event.stopPropagation();
    if (loading || saving || error) return;
    setSaving(true);
    try {
      const preferences = await saveSalePreferences(selected || null);
      onSaved(preferences.metodoPagoId);
      toast.success('Método de pago predeterminado guardado');
      onClose();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudieron guardar los ajustes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal ref={panel} onClose={onClose} closeDisabled={saving} className="!max-w-[480px]">
      <ModalHeader
        title="Ajustes de venta"
        subtitle="Preferencias de tu cuenta"
        onClose={onClose}
        closeDisabled={saving}
      />
      <form className={modalFormClass} onSubmit={save}>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Método de pago predeterminado</span>
          <select
            className={controlClass}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={loading || saving || Boolean(error)}
          >
            <option value="">Sin método predeterminado</option>
            {methods
              .filter((method) => method.estado)
              .map((method) => (
                <option key={method.id} value={method.id}>
                  {paymentMethodOptionLabel(method)}
                </option>
              ))}
          </select>
        </label>
        <p className="col-span-full m-0 text-xs leading-relaxed text-muted">
          Se seleccionará al iniciar una venta o una venta rápida, también en otros dispositivos.
          Puedes cambiarlo en cada venta. Las ventas ya registradas conservan su método.
        </p>
        {loading ? (
          <p className="col-span-full m-0 text-xs text-muted" role="status">
            Cargando ajustes…
          </p>
        ) : null}
        {error ? (
          <div className="col-span-full text-sm" role="alert">
            <p>{error}</p>
            <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>
              Reintentar
            </Button>
          </div>
        ) : null}
        <div className={modalActionsClass}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading || saving || Boolean(error)}>
            {saving ? 'Guardando…' : 'Guardar ajuste'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
