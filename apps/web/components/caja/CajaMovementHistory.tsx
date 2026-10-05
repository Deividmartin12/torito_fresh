'use client';

import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { MovimientoCaja, tiposCaja } from '../../lib/caja';
import { fechaHoraCaja } from '../../lib/caja-form';
import { moneda } from '../../lib/format';
import { puede } from '../../lib/permissions';
import { usePermisos } from '../../lib/useCurrentUser';
import { DataTable, DataTableColumn } from '../DataTable';

export function CajaMovementHistory({
  rows,
  loading,
  failed,
}: {
  rows: MovimientoCaja[];
  loading: boolean;
  failed: boolean;
}) {
  const permisos = usePermisos();
  function source(row: MovimientoCaja) {
    if (row.ventaId && puede(permisos, 'ventas.ver'))
      return (
        <Link className="text-accent underline" href={`/ventas?ventaId=${row.ventaId}`}>
          Ver venta
        </Link>
      );
    if (row.origen === 'GASTO' && row.origenId && puede(permisos, 'gastos.ver'))
      return (
        <Link className="text-accent underline" href={`/gastos?gastoId=${row.origenId}`}>
          Ver gasto
        </Link>
      );
    return row.origenId ? `${row.origen === 'PAGO' ? 'Cobro' : 'Gasto'} #${row.origenId}` : null;
  }
  const columns: DataTableColumn<MovimientoCaja>[] = [
    {
      key: 'fecha',
      header: 'Fecha efectiva',
      render: (r) => (
        <>
          <span className="whitespace-nowrap">{fechaHoraCaja(r.fecha)}</span>
          <small className="mt-1 block text-muted">
            Registrado: {fechaHoraCaja(r.registradoAt)}
          </small>
        </>
      ),
    },
    {
      key: 'tipo',
      header: 'Movimiento',
      render: (r) => (
        <>
          <strong className="font-medium">{tiposCaja[r.tipo] ?? r.tipo}</strong>
          <small className="mt-1 block max-w-[300px] break-words text-muted">{r.descripcion}</small>
        </>
      ),
    },
    {
      key: 'cuenta',
      header: 'Cuenta',
      render: (r) => (
        <>
          {r.metodo}
          <small className="mt-1 block text-muted">{r.unidad}</small>
        </>
      ),
    },
    {
      key: 'importe',
      header: 'Importe',
      render: (r) => (
        <strong
          className={`whitespace-nowrap tabular-nums ${r.importe < 0 ? 'text-status-red-text' : 'text-status-green-text'}`}
        >
          {r.importe > 0 ? '+' : ''}
          {moneda(r.importe)}
        </strong>
      ),
    },
    {
      key: 'saldo',
      header: 'Saldo acumulado',
      render: (r) =>
        r.saldo == null ? (
          <small className="text-muted">Sin inicializar / anterior a apertura</small>
        ) : (
          <span className="whitespace-nowrap tabular-nums">{moneda(r.saldo)}</span>
        ),
    },
    { key: 'responsable', header: 'Responsable', render: (r) => r.responsable },
    { key: 'origen', header: 'Origen', render: (r) => source(r) ?? '—' },
  ];
  const emptyMessage = failed
    ? 'No se pudo cargar el historial. Intenta actualizar.'
    : 'No hay movimientos en este período.';
  return (
    <>
      <div className="hidden tablet:block">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          emptyMessage={emptyMessage}
          pagination={false}
        />
      </div>
      <div className="tablet:hidden">
        {loading ? (
          <div
            className="rounded-container-lg border border-line bg-surface p-5 text-center text-sm text-muted"
            role="status"
          >
            Cargando movimientos…
          </div>
        ) : !rows.length ? (
          <div className="rounded-container-lg border border-line bg-surface p-5 text-center text-sm text-muted">
            {emptyMessage}
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0" aria-label="Movimientos registrados">
            {rows.map((r) => {
              const Icon = r.importe < 0 ? ArrowUpRight : ArrowDownLeft;
              return (
                <li
                  key={r.id}
                  className="min-w-0 rounded-container-lg border border-line bg-surface p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${r.importe < 0 ? 'bg-status-red-bg text-status-red-text' : 'bg-status-green-bg text-status-green-text'}`}
                      >
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <strong className="block text-sm font-medium">
                          {tiposCaja[r.tipo] ?? r.tipo}
                        </strong>
                        <small className="mt-1 block text-[11px] text-muted">
                          {fechaHoraCaja(r.fecha)}
                        </small>
                      </div>
                    </div>
                    <strong
                      className={`shrink-0 text-sm tabular-nums ${r.importe < 0 ? 'text-status-red-text' : 'text-status-green-text'}`}
                    >
                      {r.importe > 0 ? '+' : ''}
                      {moneda(r.importe)}
                    </strong>
                  </div>
                  <p className="mb-0 mt-2 text-xs text-muted">
                    {r.metodo} · {r.unidad}
                  </p>
                  <p className="mb-0 mt-1 break-words text-sm">{r.descripcion}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs">
                    <span className="text-muted">
                      Saldo:{' '}
                      <strong className="font-medium text-fg">
                        {r.saldo == null
                          ? 'Sin inicializar / anterior a apertura'
                          : moneda(r.saldo)}
                      </strong>
                    </span>
                    {source(r)}
                  </div>
                  <details className="mt-2 text-xs text-muted">
                    <summary className="cursor-pointer">Responsable y registro</summary>
                    <p className="mb-0 mt-2">
                      {r.responsable}
                      <br />
                      Registrado: {fechaHoraCaja(r.registradoAt)}
                    </p>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
