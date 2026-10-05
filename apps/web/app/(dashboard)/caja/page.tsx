'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  Clock3,
  History,
  Plus,
  RefreshCw,
  WalletCards,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { CajaDialog, CajaOperationDialog } from '../../../components/caja/CajaOperationDialog';
import { useUnidad } from '../../../components/UnidadProvider';
import { Button, buttonClass } from '../../../components/ui/Button';
import { controlClass, fieldLabelClass } from '../../../components/ui/Field';
import { CuentaCaja, getCuentasCaja } from '../../../lib/caja';
import { fechaHoraCaja } from '../../../lib/caja-form';
import { fechaCorta, moneda } from '../../../lib/format';
import { puede } from '../../../lib/permissions';
import { usePermisos } from '../../../lib/useCurrentUser';

export default function CajaPage() {
  const { clave, resumen } = useUnidad();
  const permisos = usePermisos();
  const canMove = puede(permisos, 'caja.movimientos');
  const canAdjust = puede(permisos, 'caja.ajustar');
  const [unit, setUnit] = useState('');
  const [dialog, setDialog] = useState<CajaDialog | null>(null);
  const accountsQuery = useQuery({
    queryKey: ['caja-cuentas', clave],
    queryFn: getCuentasCaja,
    refetchInterval: 30_000,
  });
  const accounts = accountsQuery.data ?? [];
  const visible = accounts.filter((a) => !unit || a.unidadNegocioId === unit);
  const available = accounts.filter((a) => a.id && a.fechaApertura && a.activo);
  const availableOrigins = available.filter((a) => !unit || a.unidadNegocioId === unit);
  const units = [...new Map(accounts.map((a) => [a.unidadNegocioId, a.unidad])).entries()];
  const opened = visible.filter((a) => a.fechaApertura && a.saldo != null);
  const pending = visible.filter((a) => !a.fechaApertura && a.activo);
  const negatives = opened.filter((a) => a.saldo! < 0);
  const total = opened.reduce((sum, a) => sum + Math.round(a.saldo! * 100), 0) / 100;
  const refreshAccounts = async () => {
    const result = await accountsQuery.refetch();
    if (result.error) throw result.error;
    return result.data ?? [];
  };
  const refresh = async () => {
    const result = await accountsQuery.refetch();
    if (result.error)
      toast.error('No se pudo actualizar toda la información. Puedes volver a intentarlo.');
  };
  function open(kind: CajaDialog['kind'], a?: CuentaCaja) {
    toast.dismiss();
    setDialog({ kind, account: a, key: crypto.randomUUID() });
  }
  const queryError = accountsQuery.error;

  return (
    <div className="grid min-w-0 gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="operation-eyebrow">Caja y cuentas · {resumen}</span>
          <h1 className="m-0 text-2xl font-semibold">Caja</h1>
        </div>
        <div className="flex w-full flex-wrap gap-2 tablet:w-auto">
          <Link
            href={{ pathname: '/caja/historial', query: unit ? { unidadNegocioId: unit } : {} }}
            className={buttonClass('secondary')}
          >
            <History size={16} aria-hidden="true" /> Ver historial
          </Link>
          {canMove ? (
            <Button
              onClick={() => open('manual')}
              disabled={!availableOrigins.length}
              className="grow tablet:grow-0"
            >
              <Plus size={16} aria-hidden="true" />
              Registrar movimiento
            </Button>
          ) : null}
          {canMove ? (
            <Button
              variant="secondary"
              onClick={() => open('transferencia')}
              disabled={!availableOrigins.length || available.length < 2}
            >
              <ArrowLeftRight size={16} aria-hidden="true" />
              Transferir
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => void refresh()}
            disabled={accountsQuery.isFetching}
            aria-label="Actualizar caja"
          >
            <RefreshCw
              size={16}
              className={accountsQuery.isFetching ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            Actualizar
          </Button>
        </div>
      </header>
      {queryError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-ui bg-status-red-bg p-4 text-sm text-status-red-text"
        >
          <AlertCircle size={18} className="shrink-0" />
          <div>
            {queryError instanceof Error ? queryError.message : 'No se pudo cargar Caja.'}
            <small className="mt-1 block">
              {accountsQuery.data
                ? 'Los saldos mostrados son los de la última actualización disponible.'
                : 'Actualiza para volver a cargar la información.'}
            </small>
          </div>
        </div>
      ) : null}
      {units.length > 1 ? (
        <label className="max-w-[350px]">
          <span className={fieldLabelClass}>Unidad de negocio</span>
          <select
            className={controlClass}
            aria-label="Unidad de negocio"
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
            }}
          >
            <option value="">Todas las unidades que veo</option>
            {units.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <section
        aria-label="Saldo registrado actual"
        className="min-w-0 rounded-container-lg border border-line bg-surface p-5 tablet:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-sm font-medium text-muted">Saldo registrado actual</span>
            <strong className="mt-2 block break-all text-3xl tabular-nums tablet:text-4xl">
              {accountsQuery.isPending
                ? 'Cargando saldos…'
                : !accountsQuery.data
                  ? 'Saldo no disponible'
                  : opened.length
                    ? moneda(total)
                    : 'Sin cuentas inicializadas'}
            </strong>
            <p className="mb-0 mt-2 text-xs text-muted">
              {unit
                ? units.find(([id]) => id === unit)?.[1]
                : units.length === 1
                  ? units[0][1]
                  : 'Todas las unidades que veo'}{' '}
              · solo cuentas inicializadas
            </p>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-soft-text">
            <WalletCards size={22} aria-hidden="true" />
          </span>
        </div>
        {accountsQuery.data ? (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <CheckCircle2 size={14} aria-hidden="true" />
              {opened.length}{' '}
              {opened.length === 1 ? 'cuenta inicializada' : 'cuentas inicializadas'}
            </span>
            {pending.length ? (
              <span className="flex items-center gap-1.5 text-status-amber-text">
                <Clock3 size={14} aria-hidden="true" />
                {pending.length}{' '}
                {pending.length === 1 ? 'pendiente de inicializar' : 'pendientes de inicializar'}
              </span>
            ) : null}
            {negatives.length ? (
              <span className="flex items-center gap-1.5 text-status-red-text">
                <AlertCircle size={14} aria-hidden="true" />
                {negatives.length} con saldo negativo
              </span>
            ) : null}
            <span className="text-muted">
              Última actualización: {fechaHoraCaja(accountsQuery.dataUpdatedAt)}
            </span>
          </div>
        ) : null}
      </section>
      <section aria-label="Saldos por cuenta" className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold">Saldos actuales</h2>
        </div>
        <div className="grid min-w-0 gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
          {accountsQuery.isPending ? (
            <p className="text-sm text-muted" role="status">
              Cargando cuentas…
            </p>
          ) : null}
          {!accountsQuery.isPending && accountsQuery.data && !visible.length ? (
            <p className="text-sm text-muted">No hay métodos disponibles en estas unidades.</p>
          ) : null}
          {visible.map((a) => {
            const initialized = Boolean(a.fechaApertura);
            const negative = a.saldo != null && a.saldo < 0;
            const StatusIcon =
              !a.activo || negative ? AlertCircle : !initialized ? Clock3 : CheckCircle2;
            const status = !a.activo
              ? 'Inactiva'
              : !initialized
                ? 'Sin inicializar'
                : negative
                  ? 'Saldo negativo'
                  : 'Inicializada';
            const statusClass = !a.activo
              ? 'bg-surface-soft text-muted'
              : negative
                ? 'bg-status-red-bg text-status-red-text'
                : !initialized
                  ? 'bg-status-amber-bg text-status-amber-text'
                  : 'bg-status-green-bg text-status-green-text';
            return (
              <article
                key={`${a.unidadNegocioId}:${a.metodoPagoId}`}
                className="flex min-w-0 flex-col rounded-container-lg border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                      {a.unidad}
                    </span>
                    <h3 className="mb-0 mt-1 break-words text-base font-semibold">{a.metodo}</h3>
                    <p className="mb-0 mt-1 break-words text-xs text-muted">{a.responsable}</p>
                  </div>
                  <WalletCards size={18} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
                </div>
                <strong
                  className={`mt-4 block break-all text-2xl tabular-nums ${negative ? 'text-status-red-text' : ''}`}
                >
                  {a.saldo == null ? 'Sin saldo inicial' : moneda(a.saldo)}
                </strong>
                <span
                  className={`mt-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass}`}
                >
                  <StatusIcon size={13} aria-hidden="true" />
                  {status}
                </span>
                {initialized ? (
                  <details className="mt-3 text-xs text-muted">
                    <summary className="cursor-pointer">Información de la cuenta</summary>
                    <div className="mt-2 space-y-2 leading-relaxed">
                      <p className="m-0">
                        Apertura: {fechaCorta(a.fechaApertura!.slice(0, 10))} ·{' '}
                        {moneda(a.saldoInicial)}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span>Ingresos: {moneda(a.ingresos)}</span>
                        <span>Salidas: {moneda(a.salidas)}</span>
                      </div>
                    </div>
                  </details>
                ) : null}
                <div className="mt-auto grid gap-2 pt-4">
                  {canMove && a.activo && initialized ? (
                    <Button
                      variant="secondary"
                      className="w-full border-accent bg-accent-soft text-accent-soft-text"
                      onClick={() => open('manual', a)}
                    >
                      <Plus size={15} aria-hidden="true" />
                      Registrar movimiento
                    </Button>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {a.id ? (
                      <Link
                        className={buttonClass('secondary', 'flex-1 px-3 text-[11px]')}
                        href={{
                          pathname: '/caja/historial',
                          query: { cuentaId: a.id!, unidadNegocioId: a.unidadNegocioId },
                        }}
                      >
                        Ver historial
                      </Link>
                    ) : null}
                    {canAdjust && a.activo ? (
                      <Button
                        variant={initialized ? 'secondary' : 'primary'}
                        className={initialized ? 'flex-1 px-3 text-[11px]' : 'w-full'}
                        onClick={() => open(initialized ? 'ajuste' : 'apertura', a)}
                      >
                        {initialized ? 'Ajustar saldo' : 'Inicializar cuenta'}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      {dialog ? (
        <CajaOperationDialog
          key={dialog.key}
          dialog={dialog}
          accounts={accounts}
          unit={unit}
          selectedAccount=""
          refreshAccounts={refreshAccounts}
          onClose={() => setDialog(null)}
          onSaved={(message) => {
            setDialog(null);
            toast.success(message);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
