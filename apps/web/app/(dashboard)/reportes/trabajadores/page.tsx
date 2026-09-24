'use client';

import { useQuery } from '@tanstack/react-query';
import { Coins, HandCoins, ReceiptText, Users, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../../components/DataTable';
import { PeriodFilter } from '../../../../components/PeriodFilter';
import { useUnidad } from '../../../../components/UnidadProvider';
import { ReportHeader, ReportMetric } from '../../../../components/reports/ReportNav';
import { Button } from '../../../../components/ui/Button';
import { moneda } from '../../../../lib/format';
import { conteoDe, getWorkerReport, montoDe, WorkerReportRow } from '../../../../lib/worker-report';

type TabId = 'ventas' | 'cobranzas' | 'pagos' | 'gastos';

const TABS: { id: TabId; label: string }[] = [
  { id: 'ventas', label: 'Ventas por método de pago' },
  { id: 'cobranzas', label: 'Cobrado de deudas' },
  // Se llama así y no "pagos recibidos" porque esto es plata que se le PAGA al trabajador
  // (sueldos, adelantos). Lo que él cobra de los clientes está en la pestaña de al lado.
  { id: 'pagos', label: 'Sueldos y pagos al trabajador' },
  { id: 'gastos', label: 'Gastos que registró' },
];

/** Un trabajador entra en la tabla resumen si tuvo cualquier movimiento en el período. */
const tuvoMovimiento = (row: WorkerReportRow) =>
  row.ventas.count > 0 ||
  row.cobranzas.count > 0 ||
  row.pagosRecibidos.count > 0 ||
  row.gastosRegistrados.count > 0;

export default function ReporteTrabajadoresPage() {
  const [rango, setRango] = useState<{ from: string; to: string } | null>(null);
  const [tab, setTab] = useState<TabId>('ventas');
  const [mostrarTodos, setMostrarTodos] = useState(false);
  // Solo dispara la recarga: la unidad viaja al API desde `api()`.
  const { clave: unidad, resumen: unidadResumen } = useUnidad();

  const handlePeriod = useCallback((from: string, to: string) => {
    setRango({ from, to });
  }, []);

  // `enabled` espera a que PeriodFilter publique su rango, para no pedir dos veces al montar.
  const query = useQuery({
    queryKey: ['worker-report', rango?.from, rango?.to, unidad],
    queryFn: () => getWorkerReport(rango!.from, rango!.to),
    enabled: Boolean(rango),
  });
  const report = query.data ?? null;
  const loading = query.isPending;
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error
          ? query.error.message
          : 'No se pudo cargar el reporte por trabajador',
      );
    }
  }, [query.error]);

  const workers = report?.workers ?? [];
  const conMovimiento = useMemo(() => workers.filter(tuvoMovimiento), [workers]);
  const filas = mostrarTodos ? workers : conMovimiento;
  const sinMovimiento = workers.length - conMovimiento.length;
  const totals = report?.totals;

  const columns: DataTableColumn<WorkerReportRow>[] = [
    {
      key: 'trabajador',
      header: 'Trabajador',
      cardLabel: null,
      render: (row) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{row.nombre}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {row.cargo}
            {row.activo ? '' : ' · inactivo'}
          </small>
        </>
      ),
    },
    { key: 'ventas', header: 'Ventas', render: (row) => row.ventas.count },
    {
      key: 'vendido',
      header: 'Vendido',
      render: (row) => (
        <strong className="text-[13px] font-medium text-fg">{moneda(row.ventas.total)}</strong>
      ),
    },
    {
      key: 'cobranzas',
      header: 'Cobrado de deudas',
      render: (row) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">
            {moneda(row.cobranzas.total)}
          </strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {row.cobranzas.count} cobros
          </small>
        </>
      ),
    },
    {
      key: 'pagos',
      header: 'Sueldos y pagos',
      render: (row) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">
            {moneda(row.pagosRecibidos.total)}
          </strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {row.pagosRecibidos.count} pagos
          </small>
        </>
      ),
    },
    {
      key: 'gastos',
      header: 'Gastos que registró',
      render: (row) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">
            {moneda(row.gastosRegistrados.total)}
          </strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {row.gastosRegistrados.count} gastos
          </small>
        </>
      ),
    },
  ];

  return (
    <div className="module-page report-page">
      <ReportHeader
        eyebrow="Reportes"
        title="Reporte por trabajador"
        caption={unidadResumen ? `Alcance: ${unidadResumen}` : undefined}
      />

      <section className="report-metrics">
        <ReportMetric
          label="Vendido"
          value={moneda(totals?.montoVendido ?? 0)}
          detail={`${totals?.ventas ?? 0} ventas confirmadas, netas de devoluciones`}
        />
        <ReportMetric
          label="Cobrado de deudas"
          value={moneda(totals?.montoCobrado ?? 0)}
          detail={`${totals?.cobranzas ?? 0} cobros en la calle, netos de anulaciones`}
        />
        <ReportMetric
          label="Pagado a trabajadores"
          value={moneda(totals?.montoPagado ?? 0)}
          detail={`${totals?.pagosRecibidos ?? 0} pagos registrados en el período`}
        />
        <ReportMetric
          label="Gastos que registraron"
          value={moneda(totals?.montoGastos ?? 0)}
          detail={`${totals?.gastosRegistrados ?? 0} gastos cargados al sistema`}
        />
        <ReportMetric
          label="Trabajadores con movimiento"
          value={conMovimiento.length}
          detail={`de ${workers.length} registrados`}
        />
      </section>

      <PeriodFilter defaultPeriod="month" onChange={handlePeriod} />

      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Calculando el reporte...
        </div>
      ) : !workers.length ? (
        <div className="empty-state">
          <Users size={34} />
          <h2>Aún no hay trabajadores</h2>
          <p>Registra trabajadores en Configuración para poder medir sus ventas y sus pagos.</p>
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={filas}
            rowKey={(row) => row.id}
            emptyMessage={
              <div className="flex flex-col items-center gap-2.5">
                <Users size={22} />
                <span>Ningún trabajador tuvo movimiento en este período.</span>
              </div>
            }
          />

          {sinMovimiento > 0 ? (
            <div className="module-tools report-filters">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setMostrarTodos((current) => !current)}
              >
                {mostrarTodos
                  ? 'Ocultar trabajadores sin movimiento'
                  : `Mostrar ${sinMovimiento} trabajador${sinMovimiento === 1 ? '' : 'es'} sin movimiento`}
              </Button>
            </div>
          ) : null}

          <div className="report-tabs" role="tablist" aria-label="Detalle del reporte">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? 'active' : ''}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'ventas' ? (
            <BreakdownTable
              icon={<Wallet size={22} />}
              columnas={report?.metodosVenta ?? []}
              filas={filas.filter((row) => row.ventas.count > 0)}
              breakdown={(row) => row.ventasPorMetodo}
              total={(row) => row.ventas.total}
              conteo={(row) => row.ventas.count}
              etiquetaConteo="Ventas"
              vacio="Nadie registró ventas en este período."
              sinColumnas="No hay formas de cobro registradas en el período."
            />
          ) : null}

          {tab === 'cobranzas' ? (
            <BreakdownTable
              icon={<Coins size={22} />}
              columnas={report?.metodosCobranza ?? []}
              filas={filas.filter((row) => row.cobranzas.count > 0)}
              breakdown={(row) => row.cobranzasPorMetodo}
              total={(row) => row.cobranzas.total}
              conteo={(row) => row.cobranzas.count}
              etiquetaConteo="Cobros"
              vacio="Nadie cobró deudas en este período. Los cobros se registran desde Cobranzas."
              sinColumnas="Los cobros del período no tienen método de pago registrado."
            />
          ) : null}

          {tab === 'pagos' ? (
            <BreakdownTable
              icon={<HandCoins size={22} />}
              columnas={report?.metodosPago ?? []}
              filas={filas.filter((row) => row.pagosRecibidos.count > 0)}
              breakdown={(row) => row.pagosPorMetodo}
              total={(row) => row.pagosRecibidos.total}
              conteo={(row) => row.pagosRecibidos.count}
              etiquetaConteo="Pagos"
              vacio='No hay pagos a trabajadores en este período. Se registran como un gasto de categoría "Pago a trabajador".'
              sinColumnas="Los pagos del período no tienen método de pago registrado."
            />
          ) : null}

          {tab === 'gastos' ? (
            <BreakdownTable
              icon={<ReceiptText size={22} />}
              columnas={report?.categoriasGasto ?? []}
              filas={filas.filter((row) => row.gastosRegistrados.count > 0)}
              breakdown={(row) => row.gastosPorCategoria}
              total={(row) => row.gastosRegistrados.total}
              conteo={(row) => row.gastosRegistrados.count}
              etiquetaConteo="Gastos"
              vacio="Nadie registró gastos en este período."
              sinColumnas="No hay categorías de gasto con movimiento en el período."
            />
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Tabla trabajador × columnas (formas de cobro, formas de pago o categorías de gasto). Las
 * columnas son dinámicas: solo aparecen las que tuvieron movimiento en el período, así la
 * tabla no se llena de ceros.
 */
function BreakdownTable({
  icon,
  columnas,
  filas,
  breakdown,
  total,
  conteo,
  etiquetaConteo,
  vacio,
  sinColumnas,
}: {
  icon: React.ReactNode;
  columnas: string[];
  filas: WorkerReportRow[];
  breakdown: (row: WorkerReportRow) => WorkerReportRow['ventasPorMetodo'];
  total: (row: WorkerReportRow) => number;
  conteo: (row: WorkerReportRow) => number;
  etiquetaConteo: string;
  vacio: string;
  sinColumnas: string;
}) {
  if (!filas.length || !columnas.length) {
    return (
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 text-muted">
        {icon}
        <span>{filas.length ? sinColumnas : vacio}</span>
      </div>
    );
  }

  const totalColumna = (name: string) =>
    filas.reduce((sum, row) => sum + montoDe(breakdown(row), name), 0);

  // Columnas y totales fijos: en vez del apilado en tarjetas del resto de las tablas, este
  // desglose se desplaza horizontalmente en móvil para no perder la comparación entre
  // trabajadores y subcategorías (ver la convención de reportes por columnas).
  return (
    <div className="overflow-x-auto rounded-ui border border-line bg-surface">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="border-b border-line bg-surface px-4 py-3.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted">
              Trabajador
            </th>
            {columnas.map((name) => (
              <th
                key={name}
                className="border-b border-line bg-surface px-4 py-3.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted"
              >
                {name}
              </th>
            ))}
            <th className="border-b border-line bg-surface px-4 py-3.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((row) => (
            <tr key={row.id} className="border-t border-line hover:bg-surface-soft">
              <td className="px-4 py-3.5 align-middle text-fg">
                <strong className="block text-[13px] font-medium text-fg">{row.nombre}</strong>
                <small className="mt-0.5 block text-[11px] text-muted">
                  {conteo(row)} {etiquetaConteo.toLowerCase()}
                </small>
              </td>
              {columnas.map((name) => {
                const amount = montoDe(breakdown(row), name);
                const count = conteoDe(breakdown(row), name);
                return (
                  <td key={name} className="px-4 py-3.5 align-middle text-fg">
                    {amount ? (
                      <>
                        <strong className="block text-[13px] font-medium text-fg">
                          {moneda(amount)}
                        </strong>
                        <small className="mt-0.5 block text-[11px] text-muted">
                          {count} {count === 1 ? 'registro' : 'registros'}
                        </small>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                );
              })}
              <td className="px-4 py-3.5 align-middle text-fg">
                <strong className="text-[13px] font-medium text-fg">{moneda(total(row))}</strong>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line-strong bg-surface-soft">
            <th className="px-4 py-3.5 text-left text-[13px] font-medium text-fg">Total</th>
            {columnas.map((name) => (
              <th key={name} className="px-4 py-3.5 text-left text-[13px] font-medium text-fg">
                {moneda(totalColumna(name))}
              </th>
            ))}
            <th className="px-4 py-3.5 text-left text-[13px] font-medium text-fg">
              {moneda(filas.reduce((sum, row) => sum + total(row), 0))}
            </th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
