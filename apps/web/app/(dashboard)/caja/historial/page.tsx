'use client';

import { Suspense, useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { CajaMovementHistory } from '../../../../components/caja/CajaMovementHistory';
import { DataTable } from '../../../../components/DataTable';
import { PeriodFilter } from '../../../../components/PeriodFilter';
import { useUnidad } from '../../../../components/UnidadProvider';
import { Button, buttonClass } from '../../../../components/ui/Button';
import { controlClass, fieldLabelClass } from '../../../../components/ui/Field';
import { getCuentasCaja, getMovimientosCaja, tiposCaja } from '../../../../lib/caja';
import { fechaLimaInput } from '../../../../lib/caja-form';
import { fechaCorta, moneda } from '../../../../lib/format';
import { puede } from '../../../../lib/permissions';
import { usePermisos } from '../../../../lib/useCurrentUser';

function CajaHistoryContent() {
  const searchParams = useSearchParams();
  const { clave, resumen } = useUnidad();
  const permisos = usePermisos();
  const [unit, setUnit] = useState(searchParams.get('unidadNegocioId') ?? '');
  const [account, setAccount] = useState(searchParams.get('cuentaId') ?? '');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<{ from: string; to: string; label: string } | null>(null);
  const accountsQuery = useQuery({
    queryKey: ['caja-cuentas', clave],
    queryFn: getCuentasCaja,
    refetchInterval: 30_000,
  });
  const accounts = accountsQuery.data ?? [];
  const visible = accounts.filter((a) => !unit || a.unidadNegocioId === unit);
  const units = [...new Map(accounts.map((a) => [a.unidadNegocioId, a.unidad])).entries()];
  const historyQuery = useQuery({
    queryKey: ['caja-movimientos', clave, unit, account, type, period?.from, period?.to, page],
    queryFn: () =>
      getMovimientosCaja({
        unidadNegocioId: unit,
        cuentaId: account,
        tipo: type,
        from: period!.from,
        to: period!.to,
        pagina: String(page),
      }),
    enabled: Boolean(period),
    refetchInterval: 30_000,
  });
  const history = historyQuery.data;
  const handlePeriod = useCallback((from: string, to: string, meta: { label: string }) => {
    setPeriod({ from, to, label: meta.label });
    setPage(1);
  }, []);

  const refresh = async () => {
    const results = await Promise.all([
      accountsQuery.refetch(),
      ...(period ? [historyQuery.refetch()] : []),
    ]);
    if (results.some((result) => result.error))
      toast.error('No se pudo actualizar el historial. Puedes volver a intentarlo.');
  };
  const queryError = accountsQuery.error ?? historyQuery.error;
  const historyLabel =
    period?.from === fechaLimaInput() && period?.to === fechaLimaInput() ? 'Hoy' : period?.label;
  const pages = Math.max(1, Math.ceil((history?.total ?? 0) / 50));

  return (
    <div className="grid min-w-0 gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="operation-eyebrow">Caja y cuentas · {resumen}</span>
          <h1 className="m-0 text-2xl font-semibold">Historial de Caja</h1>
          <p className="mb-0 mt-1 text-sm text-muted">
            Revisa los movimientos de tus cuentas y sus saldos acumulados.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/caja" className={buttonClass('secondary')}>
            <ArrowLeft size={16} aria-hidden="true" /> Volver a Caja
          </Link>
          <Button
            variant="secondary"
            onClick={() => void refresh()}
            disabled={accountsQuery.isFetching || historyQuery.isFetching}
          >
            <RefreshCw
              size={16}
              aria-hidden="true"
              className={accountsQuery.isFetching || historyQuery.isFetching ? 'animate-spin' : ''}
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
            {queryError instanceof Error
              ? queryError.message
              : 'No se pudo cargar el historial de Caja.'}
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
              setAccount('');
              setPage(1);
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

      <section className="grid min-w-0 gap-4" aria-label="Historial de caja">
        <div>
          <h2 className="m-0 text-lg font-semibold">Historial de movimientos</h2>
          <p className="mb-0 mt-1 text-xs text-muted">
            Consulta entradas y salidas de tus cuentas en el período seleccionado.
          </p>
        </div>
        <PeriodFilter defaultPeriod="day" onChange={handlePeriod} />
        <div className="grid min-w-0 gap-3 tablet:grid-cols-2">
          <label className="min-w-0">
            <span className={fieldLabelClass}>Cuenta</span>
            <select
              className={controlClass}
              aria-label="Cuenta"
              value={account}
              onChange={(e) => {
                setAccount(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas las cuentas</option>
              {visible
                .filter((a) => a.id)
                .map((a) => (
                  <option key={a.id!} value={a.id!}>
                    {a.metodo} · {a.unidad}
                  </option>
                ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className={fieldLabelClass}>Tipo de movimiento</span>
            <select
              className={controlClass}
              aria-label="Tipo de movimiento"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos los tipos</option>
              {Object.entries(tiposCaja).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="rounded-container-lg border border-line bg-surface p-4">
          <span className="text-xs text-muted">
            {historyLabel ?? 'Cargando período…'} · totales del historial filtrado
          </span>
          <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 tablet:grid-cols-3">
            {[
              {
                label: 'Ingresos',
                value: history?.ingresos,
                Icon: ArrowDownLeft,
                color: 'text-status-green-text',
              },
              {
                label: 'Salidas',
                value: history?.salidas,
                Icon: ArrowUpRight,
                color: 'text-status-red-text',
              },
              {
                label: 'Neto del período',
                value: history ? history.ingresos - history.salidas : undefined,
                Icon: ArrowLeftRight,
                color: 'text-fg',
              },
            ].map(({ label, value, Icon, color }) => (
              <div key={label} className="flex min-w-0 items-start gap-2">
                <Icon size={17} className={`mt-0.5 shrink-0 ${color}`} aria-hidden="true" />
                <div className="min-w-0">
                  <span className="text-xs text-muted">{label}</span>
                  <strong className={`mt-0.5 block break-all text-lg tabular-nums ${color}`}>
                    {value == null ? '—' : moneda(value)}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </div>
        <CajaMovementHistory
          rows={history?.items ?? []}
          loading={historyQuery.isPending}
          failed={historyQuery.isError}
        />
        {history && history.total > 0 ? (
          <nav
            className="flex flex-wrap items-center justify-between gap-3 text-xs"
            aria-label="Páginas del historial de caja"
          >
            <span className="text-muted">
              {(page - 1) * 50 + 1}–{Math.min(page * 50, history.total)} de {history.total}{' '}
              movimientos
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1 || historyQuery.isFetching}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Página anterior"
              >
                Anterior
              </Button>
              <span className="text-muted">
                {page} / {pages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= pages || historyQuery.isFetching}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Página siguiente"
              >
                Siguiente
              </Button>
            </div>
          </nav>
        ) : null}
        <p className="m-0 text-xs leading-relaxed text-muted">
          El saldo acumulado incluye todos los movimientos de la cuenta hasta esa fecha, aunque
          filtres un tipo. Las correcciones conservan la fecha de la operación original.
        </p>
      </section>
      {history?.gastosSinCuenta.cantidad ? (
        <section
          className="min-w-0 rounded-container-lg border border-status-amber-text bg-surface p-4"
          aria-label="Gastos sin cuenta"
        >
          <div className="flex items-start gap-2">
            <AlertCircle
              size={20}
              className="mt-0.5 shrink-0 text-status-amber-text"
              aria-hidden="true"
            />
            <div>
              <h2 className="m-0 text-base font-semibold">Gastos sin método de pago</h2>
              <p className="mb-0 mt-1 text-sm">
                {history.gastosSinCuenta.cantidad} gastos ·{' '}
                <strong>{moneda(history.gastosSinCuenta.monto)}</strong>
              </p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            De la unidad y el período seleccionados. Requieren revisar los saldos: no se descuentan
            de ninguna cuenta. Carga diaria conserva sus gastos sin método.
          </p>
          <details>
            <summary className="flex cursor-pointer items-center gap-1.5 text-sm text-accent">
              Ver gastos pendientes de revisar
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <div className="mt-3">
              <DataTable
                rows={history.gastosSinCuenta.items}
                rowKey={(g) => g.id}
                emptyMessage="Sin gastos pendientes de revisar."
                pagination={false}
                columns={[
                  {
                    key: 'fecha',
                    header: 'Fecha',
                    render: (g) => fechaCorta(g.fecha.slice(0, 10)),
                  },
                  {
                    key: 'concepto',
                    header: 'Gasto',
                    render: (g) => (
                      <>
                        {g.concepto}
                        <small className="block text-muted">
                          {g.unidad} · {g.origen}
                        </small>
                      </>
                    ),
                  },
                  { key: 'monto', header: 'Importe', render: (g) => moneda(g.monto) },
                  {
                    key: 'origen',
                    header: 'Origen',
                    render: (g) =>
                      puede(permisos, 'gastos.ver') ? (
                        <Link className="text-accent underline" href={`/gastos?gastoId=${g.id}`}>
                          Ver gasto
                        </Link>
                      ) : (
                        g.origen
                      ),
                  },
                ]}
              />
            </div>
            {history.gastosSinCuenta.cantidad > 50 ? (
              <p className="text-xs text-muted">
                Se muestran los 50 más recientes. Consulta Gastos para ver el período completo.
              </p>
            ) : null}
          </details>
        </section>
      ) : null}
    </div>
  );
}

export default function CajaHistoryPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted" role="status">
          Cargando historial…
        </p>
      }
    >
      <CajaHistoryContent />
    </Suspense>
  );
}
