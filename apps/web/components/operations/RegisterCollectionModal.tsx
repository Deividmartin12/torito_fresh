'use client';

import { TriangleAlert } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { moneda } from '../../lib/format';
import { resumenVencimiento } from '../../lib/credit';
import {
  OperationalAccount,
  OperationalPaymentMethod,
  registerOperationalPayment,
} from '../../lib/operations';
import { PaymentMethod } from '../../lib/payment-methods';
import { PaymentMethodFormModal } from '../PaymentMethodFormModal';
import { SearchableSelect } from '../SearchableSelect';
import { Button } from '../ui/Button';
import {
  controlClass,
  fieldLabelClass,
  fieldWideClass,
  modalActionsClass,
  modalFormClass,
  textareaClass,
} from '../ui/Field';
import { Modal, ModalHeader } from '../ui/Modal';

const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

type Props = {
  tipo: 'cobrar' | 'pagar';
  cuenta: OperationalAccount;
  /** Cuentas alternativas para el selector; si se omite, la cuenta viene fija. */
  cuentas?: OperationalAccount[];
  metodos: OperationalPaymentMethod[];
  onClose: () => void;
  onDone: (updated: OperationalAccount) => void;
};

export function RegisterCollectionModal({
  tipo,
  cuenta,
  cuentas,
  metodos,
  onClose,
  onDone,
}: Props) {
  const cobrar = tipo === 'cobrar';
  const dialogRef = useRef<HTMLElement>(null);
  const [cuentaId, setCuentaId] = useState(cuenta.id);
  // Lista local para poder sumar métodos creados con "+ Agregar método de pago" sin recargar.
  const [metodoList, setMetodoList] = useState<OperationalPaymentMethod[]>(metodos);
  const [metodoId, setMetodoId] = useState(metodos[0]?.id ?? '');
  const [metodoModal, setMetodoModal] = useState(false);
  const [monto, setMonto] = useState('');
  const [fechaPago, setFechaPago] = useState(today);
  const [observaciones, setObservaciones] = useState('');
  const [saving, setSaving] = useState(false);

  const opciones = cuentas?.filter((item) => item.saldo > 0) ?? [cuenta];
  const seleccionada = opciones.find((item) => item.id === cuentaId) ?? cuenta;
  const vencimiento = useMemo(
    () => resumenVencimiento(seleccionada.vencimiento, seleccionada.saldo),
    [seleccionada],
  );

  useEffect(() => {
    setMonto(seleccionada.saldo.toFixed(2));
  }, [seleccionada]);

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
    if (!metodoId) {
      toast.error('Selecciona un método de pago.');
      return;
    }
    const amount = Number(monto);
    if (!Number.isFinite(amount) || amount <= 0 || amount > seleccionada.saldo) {
      toast.error(`El monto debe ser mayor a cero y no superar ${moneda(seleccionada.saldo)}.`);
      return;
    }
    setSaving(true);
    try {
      const updated = await registerOperationalPayment(tipo, {
        cuentaId: Number(seleccionada.id),
        metodoPagoId: Number(metodoId),
        monto: amount,
        fechaPago,
        observaciones: observaciones.trim() || undefined,
      });
      toast.success(`${cobrar ? 'Cobro' : 'Pago'} de ${moneda(amount)} registrado correctamente.`);
      onDone(updated);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar el pago');
    } finally {
      setSaving(false);
    }
  }

  function handleMetodoCreado(method: PaymentMethod) {
    setMetodoList((current) =>
      current.some((item) => item.id === method.id)
        ? current
        : [...current, { id: method.id, nombre: method.nombre }],
    );
    setMetodoId(method.id);
    setMetodoModal(false);
  }

  const saldoDespues = Math.max(seleccionada.saldo - (Number(monto) || 0), 0);

  return (
    <Modal ref={dialogRef} onClose={onClose} closeDisabled={saving}>
      <ModalHeader
        title={cobrar ? 'Registrar cobro' : 'Registrar pago a proveedor'}
        subtitle="El abono actualiza automáticamente el saldo y el estado de la cuenta."
        onClose={onClose}
        closeDisabled={saving}
      />

      {vencimiento.tone === 'overdue' ? (
        <div className="collection-overdue-banner">
          <TriangleAlert size={16} />
          <span>{vencimiento.label}. Prioriza este cobro.</span>
        </div>
      ) : null}

      <form className={modalFormClass} onSubmit={guardar}>
        {opciones.length > 1 ? (
          <label className={fieldWideClass}>
            <span className={fieldLabelClass}>{cobrar ? 'Comprobante' : 'Cuenta'}</span>
            <SearchableSelect
              value={cuentaId}
              onChange={setCuentaId}
              options={opciones.map((item) => ({
                value: item.id,
                label: `${item.tercero} · ${item.comprobante} · ${moneda(item.saldo)}`,
              }))}
              placeholder={cobrar ? 'Buscar comprobante' : 'Buscar cuenta'}
            />
          </label>
        ) : (
          <div className={`collection-fixed-account ${fieldWideClass}`}>
            <span>{seleccionada.tercero}</span>
            <strong>
              {seleccionada.comprobante} · saldo {moneda(seleccionada.saldo)}
            </strong>
          </div>
        )}

        <label>
          <span className={fieldLabelClass}>Método de pago</span>
          <SearchableSelect
            value={metodoId}
            onChange={setMetodoId}
            options={metodoList.map((item) => ({ value: item.id, label: item.nombre }))}
            placeholder="Seleccionar método"
            actionLabel="+ Agregar método de pago"
            onAction={() => setMetodoModal(true)}
          />
        </label>

        <label>
          <span className={fieldLabelClass}>Monto a {cobrar ? 'cobrar' : 'pagar'}</span>
          <input
            className={controlClass}
            type="number"
            min="0.01"
            step="0.01"
            max={seleccionada.saldo}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
          />
          <div className="collection-amount-shortcuts">
            <button type="button" onClick={() => setMonto(seleccionada.saldo.toFixed(2))}>
              Saldo completo
            </button>
            <button type="button" onClick={() => setMonto((seleccionada.saldo / 2).toFixed(2))}>
              Mitad
            </button>
          </div>
        </label>

        <label>
          <span className={fieldLabelClass}>Fecha</span>
          <input
            className={controlClass}
            type="date"
            max={today()}
            value={fechaPago}
            onChange={(e) => setFechaPago(e.target.value)}
            required
          />
        </label>

        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Observaciones</span>
          <textarea
            className={textareaClass}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Detalle opcional del pago"
          />
        </label>

        <div className={`payment-balance-preview ${fieldWideClass}`}>
          <span>
            Saldo actual <strong>{moneda(seleccionada.saldo)}</strong>
          </span>
          <span>
            Saldo después del {cobrar ? 'cobro' : 'pago'} <strong>{moneda(saldoDespues)}</strong>
          </span>
        </div>

        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button disabled={saving}>
            {saving ? 'Registrando...' : `Registrar ${cobrar ? 'cobro' : 'pago'}`}
          </Button>
        </div>
      </form>

      {metodoModal ? (
        <PaymentMethodFormModal
          inline
          onClose={() => setMetodoModal(false)}
          onSaved={handleMetodoCreado}
        />
      ) : null}
    </Modal>
  );
}
