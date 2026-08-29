'use client';

import { TriangleAlert, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { money } from '../../lib/format';
import { resumenVencimiento } from '../../lib/credit';
import {
  OperationalAccount,
  OperationalPaymentMethod,
  registerOperationalPayment,
} from '../../lib/operations';

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
  const [metodoId, setMetodoId] = useState(metodos[0]?.id ?? '');
  const [monto, setMonto] = useState('');
  const [fechaPago, setFechaPago] = useState(today);
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [saving, setSaving] = useState(false);

  const opciones = cuentas?.filter((item) => item.saldo > 0) ?? [cuenta];
  const seleccionada = opciones.find((item) => item.id === cuentaId) ?? cuenta;
  const metodo = metodos.find((item) => item.id === metodoId);
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
      toast.error(`El monto debe ser mayor a cero y no superar ${money(seleccionada.saldo)}.`);
      return;
    }
    if (metodo?.requiereOperacion && !numeroOperacion.trim()) {
      toast.error(`Ingresa el número de operación para ${metodo.nombre}.`);
      return;
    }
    setSaving(true);
    try {
      const updated = await registerOperationalPayment(tipo, {
        cuentaId: Number(seleccionada.id),
        metodoPagoId: Number(metodoId),
        monto: amount,
        fechaPago,
        numeroOperacion: numeroOperacion.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
      });
      toast.success(`${cobrar ? 'Cobro' : 'Pago'} de ${money(amount)} registrado correctamente.`);
      onDone(updated);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar el pago');
    } finally {
      setSaving(false);
    }
  }

  const saldoDespues = Math.max(seleccionada.saldo - (Number(monto) || 0), 0);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <section
        className="crud-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-modal-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="modal-top">
          <div>
            <h2 id="collection-modal-title">
              {cobrar ? 'Registrar cobro' : 'Registrar pago a proveedor'}
            </h2>
            <small>El abono actualiza automáticamente el saldo y el estado de la cuenta.</small>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {vencimiento.tone === 'overdue' ? (
          <div className="collection-overdue-banner">
            <TriangleAlert size={16} />
            <span>{vencimiento.label}. Prioriza este cobro.</span>
          </div>
        ) : null}

        <form className="modal-form" onSubmit={guardar}>
          {opciones.length > 1 ? (
            <label className="field-wide">
              <span>{cobrar ? 'Comprobante' : 'Cuenta'}</span>
              <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
                {opciones.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.tercero} · {item.comprobante} · {money(item.saldo)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="field-wide collection-fixed-account">
              <span>{seleccionada.tercero}</span>
              <strong>
                {seleccionada.comprobante} · saldo {money(seleccionada.saldo)}
              </strong>
            </div>
          )}

          <label>
            <span>Método de pago</span>
            <select
              value={metodoId}
              onChange={(e) => {
                setMetodoId(e.target.value);
                setNumeroOperacion('');
              }}
            >
              {metodos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Monto a {cobrar ? 'cobrar' : 'pagar'}</span>
            <input
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
            <span>Número de operación</span>
            <input
              value={numeroOperacion}
              onChange={(e) => setNumeroOperacion(e.target.value)}
              placeholder={metodo?.requiereOperacion ? 'Obligatorio' : 'Opcional'}
              required={metodo?.requiereOperacion}
            />
          </label>

          <label>
            <span>Fecha</span>
            <input
              type="date"
              max={today()}
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              required
            />
          </label>

          <label className="field-wide">
            <span>Observaciones</span>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Detalle opcional del pago"
            />
          </label>

          <div className="payment-balance-preview field-wide">
            <span>
              Saldo actual <strong>{money(seleccionada.saldo)}</strong>
            </span>
            <span>
              Saldo después del {cobrar ? 'cobro' : 'pago'} <strong>{money(saldoDespues)}</strong>
            </span>
          </div>

          <div className="modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Registrando...' : `Registrar ${cobrar ? 'cobro' : 'pago'}`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
