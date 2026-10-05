'use client';

import { AlertCircle, ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { CuentaCaja, registrarCaja } from '../../lib/caja';
import {
  fechaCajaManual,
  fechaHoraCaja,
  fechaLimaInput,
  identidadCaja,
  parseCajaAmount,
  sumarCaja,
} from '../../lib/caja-form';
import { moneda } from '../../lib/format';
import { Button } from '../ui/Button';
import { controlClass, fieldErrorClass, fieldLabelClass, textareaClass } from '../ui/Field';
import { Modal, ModalHeader } from '../ui/Modal';

export type CajaDialog = {
  kind: 'apertura' | 'manual' | 'transferencia' | 'ajuste';
  account?: CuentaCaja;
  key: string;
};
type Props = {
  dialog: CajaDialog;
  accounts: CuentaCaja[];
  unit: string;
  selectedAccount: string;
  refreshAccounts: () => Promise<CuentaCaja[]>;
  onClose: () => void;
  onSaved: (message: string) => void;
};
type Errors = Partial<Record<'origin' | 'destination' | 'amount' | 'reason' | 'date', string>>;

function ErrorField({ name, errors }: { name: keyof Errors; errors: Errors }) {
  return errors[name] ? (
    <small id={`caja-${name}-error`} className={fieldErrorClass} role="alert">
      {errors[name]}
    </small>
  ) : null;
}

function AccountOptions({ accounts }: { accounts: CuentaCaja[] }) {
  const units = [...new Map(accounts.map((a) => [a.unidadNegocioId, a.unidad])).entries()];
  return units.map(([id, name]) => (
    <optgroup key={id} label={name}>
      {accounts
        .filter((a) => a.unidadNegocioId === id)
        .map((a) => (
          <option key={a.id!} value={a.id!}>
            {a.metodo} · {a.unidad}
          </option>
        ))}
    </optgroup>
  ));
}

function BalancePreview({
  title,
  account,
  result,
}: {
  title: string;
  account: CuentaCaja;
  result: number | null;
}) {
  return (
    <div className="min-w-0 rounded-ui border border-line bg-surface-soft p-3">
      <span className="text-xs text-muted [overflow-wrap:anywhere]">
        {title} · {account.metodo} · {account.unidad}
      </span>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
        <span className="text-sm">{moneda(account.saldo)}</span>
        <ArrowRight size={15} className="text-muted" aria-hidden="true" />
        <strong
          className={`break-all text-lg ${result != null && result < 0 ? 'text-status-red-text' : 'text-fg'}`}
        >
          {result == null ? '—' : moneda(result)}
        </strong>
      </div>
      <small className="mt-1 block text-xs text-muted">Saldo actual → saldo estimado</small>
      {result != null && result < 0 ? (
        <p className="mb-0 mt-2 flex items-start gap-1.5 text-xs text-status-red-text">
          <AlertCircle size={14} className="shrink-0" />
          Quedaría un saldo negativo. Puedes registrarlo y revisar la diferencia.
        </p>
      ) : null}
    </div>
  );
}

export function CajaOperationDialog({
  dialog,
  accounts,
  unit,
  selectedAccount,
  refreshAccounts,
  onClose,
  onSaved,
}: Props) {
  const available = accounts.filter((a) => a.id && a.fechaApertura && a.activo);
  const origins = available.filter((a) => !unit || a.unidadNegocioId === unit);
  const initialOrigin =
    dialog.account?.id ??
    (origins.find((a) => a.id === selectedAccount)?.id ||
      (origins.length === 1 ? origins[0].id : ''));
  const [origin, setOrigin] = useState(initialOrigin ?? '');
  const [destination, setDestination] = useState('');
  const [manualType, setManualType] = useState('APORTE');
  const [amount, setAmount] = useState(
    dialog.kind === 'ajuste' ? (dialog.account?.saldo?.toFixed(2) ?? '') : '',
  );
  const [date, setDate] = useState(dialog.kind === 'apertura' ? fechaLimaInput() : '');
  const [dateExpanded, setDateExpanded] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState('');
  const [reviewedAccount, setReviewedAccount] = useState(dialog.account);
  const [needsReview, setNeedsReview] = useState(false);
  const requestIdentity = useRef<ReturnType<typeof identidadCaja> | null>(null);
  const panel = useRef<HTMLElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const closeRef = useRef(onClose);
  const blockedRef = useRef(false);
  closeRef.current = onClose;
  blockedRef.current = saving || refreshing;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!blockedRef.current) closeRef.current();
      }
      if (event.key === 'Tab') {
        const controls = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]',
          ) ?? []),
        ].filter((control) => control.getClientRects().length);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
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
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown, true);
      previous?.focus();
    };
  }, []);

  const source = available.find((a) => a.id === origin);
  const target = available.find((a) => a.id === destination);
  const value = parseCajaAmount(amount);
  const validMovement = value != null && value > 0;
  const difference =
    value != null && reviewedAccount?.saldo != null
      ? sumarCaja(value, -reviewedAccount.saldo)
      : null;
  const currentAccount = accounts.find((a) => a.id === reviewedAccount?.id);
  const stale =
    dialog.kind === 'ajuste' &&
    currentAccount != null &&
    currentAccount.version !== reviewedAccount?.version;
  const noAdjustment = dialog.kind === 'ajuste' && difference === 0;
  const blocked = saving || refreshing;
  const title = {
    apertura: 'Inicializar cuenta',
    manual: 'Registrar movimiento',
    transferencia: 'Transferir entre cuentas',
    ajuste: 'Ajustar saldo',
  }[dialog.kind];
  const action =
    dialog.kind === 'apertura'
      ? 'Inicializar cuenta'
      : dialog.kind === 'transferencia'
        ? 'Confirmar transferencia'
        : dialog.kind === 'ajuste'
          ? 'Guardar ajuste'
          : manualType === 'RETIRO'
            ? 'Registrar retiro'
            : 'Registrar ingreso';
  const selected =
    dialog.kind === 'apertura'
      ? dialog.account
      : dialog.kind === 'ajuste'
        ? reviewedAccount
        : source;
  const opening =
    dialog.kind === 'transferencia' && source?.fechaApertura && target?.fechaApertura
      ? source.fechaApertura > target.fechaApertura
        ? source.fechaApertura
        : target.fechaApertura
      : source?.fechaApertura;

  function clear(name: keyof Errors) {
    setErrors((current) => ({ ...current, [name]: undefined }));
  }
  async function updateComparison() {
    setRefreshing(true);
    try {
      const fresh = await refreshAccounts();
      const updated = fresh.find((a) => a.id === reviewedAccount?.id);
      if (!updated?.activo || updated.saldo == null)
        throw new Error('Esta cuenta ya no está disponible para ajustar.');
      setReviewedAccount(updated);
      setNeedsReview(true);
      setServerError('');
    } catch (cause) {
      setServerError(cause instanceof Error ? cause.message : 'No se pudo actualizar el saldo.');
    } finally {
      setRefreshing(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || needsReview || stale || noAdjustment) return;
    const next: Errors = {};
    if (
      value == null ||
      ((dialog.kind === 'manual' || dialog.kind === 'transferencia') && value <= 0)
    )
      next.amount =
        'Ingresa un importe válido con hasta dos decimales' +
        (dialog.kind === 'manual' || dialog.kind === 'transferencia' ? ', mayor que cero.' : '.');
    if (
      (dialog.kind === 'manual' || dialog.kind === 'transferencia') &&
      (!source || !origins.some((a) => a.id === origin))
    )
      next.origin = 'Selecciona una cuenta activa e inicializada.';
    if (dialog.kind === 'transferencia' && (!target || destination === origin))
      next.destination = 'Elige una cuenta de destino diferente al origen.';
    if (dialog.kind !== 'apertura' && !reason.trim())
      next.reason = 'Escribe el motivo para reconocer esta operación en el historial.';
    if (reason.trim().length > 400) next.reason = 'El motivo admite hasta 400 caracteres.';
    let effectiveDate: string | null = null;
    if (dialog.kind === 'apertura') {
      const start = new Date(`${date}T00:00:00-05:00`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(start.getTime()) ||
        fechaLimaInput(start) !== date ||
        date > fechaLimaInput()
      )
        next.date = 'Elige un día de apertura válido, hasta hoy.';
    } else if (date && (dialog.kind === 'manual' || dialog.kind === 'transferencia')) {
      effectiveDate = fechaCajaManual(date);
      if (
        !effectiveDate ||
        new Date(effectiveDate).getTime() > Date.now() ||
        (opening && effectiveDate < opening)
      )
        next.date =
          'La fecha debe estar entre la apertura de las cuentas y el momento actual (hora de Lima).';
    }
    setErrors(next);
    setServerError('');
    if (next.date) setDateExpanded(true);
    if (Object.keys(next).length) {
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setSaving(true);
    try {
      let path: string;
      let body: object;
      const common = { motivo: reason.trim(), ...(effectiveDate ? { fecha: effectiveDate } : {}) };
      if (dialog.kind === 'apertura') {
        path = 'aperturas';
        body = {
          metodoPagoId: dialog.account!.metodoPagoId,
          unidadNegocioId: dialog.account!.unidadNegocioId,
          fecha: date,
          saldoInicial: value,
        };
      } else if (dialog.kind === 'manual') {
        path = 'movimientos';
        body = { ...common, cuentaId: origin, tipo: manualType, monto: value };
      } else if (dialog.kind === 'transferencia') {
        path = 'transferencias';
        body = { ...common, origenId: origin, destinoId: destination, monto: value };
      } else {
        path = `cuentas/${reviewedAccount!.id}/ajustes`;
        body = { motivo: reason.trim(), saldoNuevo: value, version: reviewedAccount!.version };
      }
      const identity = identidadCaja(requestIdentity.current, path, body, () =>
        crypto.randomUUID(),
      );
      requestIdentity.current = identity;
      await registrarCaja(
        path,
        dialog.kind === 'apertura' ? body : { ...body, operacionId: identity.id },
      );
      const message =
        dialog.kind === 'transferencia'
          ? `Transferencia de ${moneda(value)}: ${source!.metodo} (${source!.unidad}) → ${target!.metodo} (${target!.unidad}).`
          : dialog.kind === 'apertura'
            ? `${dialog.account!.metodo} (${dialog.account!.unidad}) inicializada con ${moneda(value)} al inicio del día.`
            : dialog.kind === 'ajuste'
              ? `Saldo de ${reviewedAccount!.metodo} (${reviewedAccount!.unidad}) ajustado a ${moneda(value)}.`
              : `${manualType === 'RETIRO' ? 'Retiro' : 'Ingreso'} de ${moneda(value)} registrado en ${source!.metodo} (${source!.unidad}).`;
      onSaved(message);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'No se pudo guardar. Tus datos se conservaron.';
      setServerError(message);
      if (dialog.kind === 'ajuste' && message.includes('El saldo cambió')) {
        setNeedsReview(true);
        await updateComparison();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      ref={panel}
      aria-label={title}
      onClose={() => {
        if (!blocked) onClose();
      }}
      closeDisabled={blocked}
      className="!max-w-[620px] !max-h-[calc(100dvh-32px)]"
    >
      <ModalHeader
        title={title}
        subtitle={
          <span className="block [overflow-wrap:anywhere]">
            {selected
              ? `${selected.metodo} · ${selected.unidad}`
              : 'Elige la cuenta y revisa el saldo antes de guardar'}
          </span>
        }
        onClose={onClose}
        closeDisabled={blocked}
      />
      <form ref={form} onSubmit={(event) => void submit(event)} noValidate>
        <fieldset
          disabled={blocked}
          className="m-0 grid w-full min-w-0 grid-cols-1 gap-4 border-0 p-4 tablet:p-5 [&>label]:min-w-0"
        >
          {dialog.kind === 'manual' ? (
            <div>
              <span className={fieldLabelClass}>¿Qué vas a registrar?</span>
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label="Dirección del movimiento"
              >
                <Button
                  variant={manualType !== 'RETIRO' ? 'primary' : 'secondary'}
                  aria-pressed={manualType !== 'RETIRO'}
                  onClick={() => {
                    if (manualType === 'RETIRO') setManualType('APORTE');
                  }}
                >
                  <ArrowDownLeft size={17} />
                  Ingreso
                </Button>
                <Button
                  variant={manualType === 'RETIRO' ? 'primary' : 'secondary'}
                  aria-pressed={manualType === 'RETIRO'}
                  onClick={() => setManualType('RETIRO')}
                >
                  <ArrowUpRight size={17} />
                  Retiro
                </Button>
              </div>
              {manualType !== 'RETIRO' ? (
                <label className="mt-3 block">
                  <span className={fieldLabelClass}>Tipo de ingreso</span>
                  <select
                    className={controlClass}
                    aria-label="Tipo de ingreso"
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value)}
                  >
                    <option value="APORTE">Aporte</option>
                    <option value="DEPOSITO">Depósito externo</option>
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
          {dialog.kind === 'manual' || dialog.kind === 'transferencia' ? (
            <div
              className={`grid min-w-0 gap-3 ${dialog.kind === 'transferencia' ? 'tablet:grid-cols-2' : ''}`}
            >
              <label className="min-w-0">
                <span className={fieldLabelClass}>
                  {dialog.kind === 'transferencia' ? 'Cuenta de origen' : 'Cuenta'}
                </span>
                <select
                  data-autofocus={!initialOrigin ? true : undefined}
                  className={controlClass}
                  aria-label={dialog.kind === 'transferencia' ? 'Cuenta de origen' : 'Cuenta'}
                  value={origin}
                  aria-invalid={Boolean(errors.origin)}
                  aria-describedby={errors.origin ? 'caja-origin-error' : undefined}
                  onChange={(e) => {
                    setOrigin(e.target.value);
                    if (destination === e.target.value) setDestination('');
                    clear('origin');
                  }}
                >
                  <option value="">Seleccionar cuenta</option>
                  <AccountOptions accounts={origins} />
                </select>
                {source ? (
                  <span className="mt-1 block text-xs text-muted [overflow-wrap:anywhere]">
                    <span className="block">
                      {source.unidad} · {source.responsable}
                    </span>
                    <span>
                      Saldo actual: <strong>{moneda(source.saldo)}</strong>
                    </span>
                  </span>
                ) : null}
                <ErrorField name="origin" errors={errors} />
              </label>
              {dialog.kind === 'transferencia' ? (
                <label className="min-w-0">
                  <span className={fieldLabelClass}>Cuenta de destino</span>
                  <select
                    className={controlClass}
                    aria-label="Cuenta de destino"
                    value={destination}
                    aria-invalid={Boolean(errors.destination)}
                    aria-describedby={errors.destination ? 'caja-destination-error' : undefined}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      clear('destination');
                    }}
                  >
                    <option value="">Seleccionar destino</option>
                    <AccountOptions accounts={available.filter((a) => a.id !== origin)} />
                  </select>
                  {target ? (
                    <span className="mt-1 block text-xs text-muted [overflow-wrap:anywhere]">
                      <span className="block">
                        {target.unidad} · {target.responsable}
                      </span>
                      <span>
                        Saldo actual: <strong>{moneda(target.saldo)}</strong>
                      </span>
                    </span>
                  ) : null}
                  <ErrorField name="destination" errors={errors} />
                </label>
              ) : null}
            </div>
          ) : null}
          {dialog.kind === 'apertura' ? (
            <p className="m-0 rounded-ui bg-accent-soft p-3 text-sm leading-relaxed text-accent-soft-text">
              Ingresa lo que había <strong>al inicio del día elegido</strong>. Después se sumarán
              sus cobros y se restarán sus gastos con método, incluidos los que registres por la
              noche. Se inicializa una sola vez.
            </p>
          ) : null}
          <label>
            <span className={fieldLabelClass}>
              {dialog.kind === 'ajuste'
                ? 'Saldo real que tienes ahora'
                : dialog.kind === 'apertura'
                  ? 'Saldo al inicio del día'
                  : 'Importe'}
            </span>
            <div className="caja-amount-field">
              <span aria-hidden="true">S/</span>
              <input
                data-autofocus={
                  initialOrigin || dialog.kind === 'apertura' || dialog.kind === 'ajuste'
                    ? true
                    : undefined
                }
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? 'caja-amount-error' : 'caja-amount-help'}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  setAmount(e.target.value);
                  clear('amount');
                }}
                onBlur={() => {
                  const parsed = parseCajaAmount(amount);
                  if (parsed !== null) setAmount(parsed.toFixed(2));
                }}
              />
            </div>
            <small id="caja-amount-help" className="mt-1 block text-xs text-muted">
              Puedes usar coma o punto decimal.
            </small>
            <ErrorField name="amount" errors={errors} />
          </label>
          {dialog.kind === 'ajuste' ? (
            <div
              className="rounded-ui border border-line bg-surface-soft p-3"
              role="region"
              aria-label="Comparación de saldo"
              aria-live="polite"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-muted">Saldo registrado</span>
                  <strong className="mt-1 block break-all text-lg tabular-nums">
                    {moneda(reviewedAccount?.saldo)}
                  </strong>
                </div>
                <div>
                  <span className="text-xs text-muted">Saldo real</span>
                  <strong className="mt-1 block break-all text-lg tabular-nums">
                    {value == null ? '—' : moneda(value)}
                  </strong>
                </div>
              </div>
              <div
                className={`mt-3 flex items-start gap-2 border-t border-line pt-3 text-sm ${noAdjustment ? 'text-status-green-text' : difference != null && difference < 0 ? 'text-status-red-text' : 'text-fg'}`}
              >
                {noAdjustment ? (
                  <CheckCircle2 size={18} className="shrink-0" />
                ) : (
                  <AlertCircle size={18} className="shrink-0" />
                )}
                <div>
                  <strong>
                    {noAdjustment
                      ? 'El saldo coincide'
                      : difference == null
                        ? 'Ingresa el saldo real para comparar'
                        : `Diferencia: ${difference > 0 ? '+' : ''}${moneda(difference)}`}
                  </strong>
                  <small className="mt-1 block text-xs">
                    {noAdjustment
                      ? 'No hace falta guardar un ajuste.'
                      : difference == null
                        ? 'El historial conservará la corrección.'
                        : `Hay ${moneda(Math.abs(difference))} ${difference > 0 ? 'más' : 'menos'} que lo registrado. Esta diferencia se guardará como ajuste.`}
                  </small>
                </div>
              </div>
            </div>
          ) : null}
          {dialog.kind === 'manual' && source ? (
            <BalancePreview
              title={manualType === 'RETIRO' ? 'Retiro' : 'Ingreso'}
              account={source}
              result={
                validMovement
                  ? sumarCaja(source.saldo!, manualType === 'RETIRO' ? -value! : value!)
                  : null
              }
            />
          ) : null}
          {dialog.kind === 'transferencia' && (source || target) ? (
            <div
              className="grid min-w-0 gap-2 tablet:grid-cols-2"
              role="region"
              aria-label="Estimación de transferencia"
            >
              {source ? (
                <BalancePreview
                  title="Sale de"
                  account={source}
                  result={validMovement ? sumarCaja(source.saldo!, -value!) : null}
                />
              ) : null}
              {target ? (
                <BalancePreview
                  title="Entra a"
                  account={target}
                  result={validMovement ? sumarCaja(target.saldo!, value!) : null}
                />
              ) : null}
            </div>
          ) : null}
          {dialog.kind === 'manual' || dialog.kind === 'transferencia' ? (
            <p className="m-0 text-xs leading-relaxed text-muted">
              La estimación usa los saldos mostrados. El saldo definitivo se actualizará al guardar.
            </p>
          ) : null}
          {dialog.kind !== 'apertura' ? (
            <label>
              <span className={fieldLabelClass}>Motivo</span>
              <textarea
                className={textareaClass}
                value={reason}
                maxLength={400}
                placeholder={
                  dialog.kind === 'ajuste'
                    ? 'Ej. Diferencia al revisar el efectivo disponible'
                    : dialog.kind === 'transferencia'
                      ? 'Ej. Pasar efectivo a la cuenta de Yape'
                      : manualType === 'RETIRO'
                        ? 'Ej. Retiro para entregar al encargado'
                        : 'Ej. Aporte del propietario'
                }
                aria-invalid={Boolean(errors.reason)}
                aria-describedby={errors.reason ? 'caja-reason-error' : undefined}
                onChange={(e) => {
                  setReason(e.target.value);
                  clear('reason');
                }}
              />
              <ErrorField name="reason" errors={errors} />
            </label>
          ) : null}
          {dialog.kind === 'apertura' ? (
            <label>
              <span className={fieldLabelClass}>Día de apertura</span>
              <input
                className={controlClass}
                type="date"
                max={fechaLimaInput()}
                value={date}
                aria-invalid={Boolean(errors.date)}
                aria-describedby={errors.date ? 'caja-date-error' : undefined}
                onChange={(e) => {
                  setDate(e.target.value);
                  clear('date');
                }}
              />
              <ErrorField name="date" errors={errors} />
            </label>
          ) : null}
          {dialog.kind === 'manual' || dialog.kind === 'transferencia' ? (
            <details
              className="rounded-ui border border-line p-3"
              open={dateExpanded}
              onToggle={(event) => setDateExpanded(event.currentTarget.open)}
            >
              <summary className="cursor-pointer text-sm text-muted">
                {date
                  ? `Fecha elegida: ${fechaHoraCaja(fechaCajaManual(date) ?? new Date().toISOString())}`
                  : 'Cambiar fecha efectiva · opcional'}
              </summary>
              <label className="mt-3 block">
                <span className={fieldLabelClass}>Fecha y hora de Lima</span>
                <input
                  className={controlClass}
                  type="datetime-local"
                  min={opening ? fechaLimaInput(new Date(opening), true) : undefined}
                  max={fechaLimaInput(new Date(), true)}
                  value={date}
                  aria-invalid={Boolean(errors.date)}
                  aria-describedby={errors.date ? 'caja-date-error' : undefined}
                  onChange={(e) => {
                    setDate(e.target.value);
                    clear('date');
                  }}
                />
                <small className="mt-1 block text-xs text-muted">
                  Vacío: se registra en el momento actual.
                </small>
                <ErrorField name="date" errors={errors} />
              </label>
            </details>
          ) : null}
          {stale || needsReview ? (
            <div
              className="rounded-ui border border-status-amber-text bg-status-amber-bg p-3 text-sm text-status-amber-text"
              role="alert"
            >
              <p className="m-0 font-semibold">El saldo cambió mientras revisabas esta cuenta.</p>
              <p className="mt-1 text-xs">
                Conservamos el saldo real y el motivo que ingresaste. Revisa la nueva comparación
                antes de confirmar.
              </p>
              {stale ? (
                <Button
                  variant="secondary"
                  onClick={() => void updateComparison()}
                  disabled={refreshing}
                >
                  Actualizar comparación
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setNeedsReview(false);
                    setServerError('');
                  }}
                >
                  Revisé el saldo actualizado
                </Button>
              )}
            </div>
          ) : null}
          {serverError ? (
            <p
              className="m-0 rounded-ui bg-status-red-bg p-3 text-sm text-status-red-text"
              role="alert"
            >
              {serverError}
            </p>
          ) : null}
        </fieldset>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-surface p-4">
          <Button variant="secondary" onClick={onClose} disabled={blocked}>
            Cancelar
          </Button>
          <Button type="submit" disabled={blocked || noAdjustment || stale || needsReview}>
            {saving ? 'Guardando…' : refreshing ? 'Actualizando…' : action}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
