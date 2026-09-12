'use client';

import { HandCoins, ReceiptText, Users, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PeriodFilter } from '../../../../components/PeriodFilter';
import { ReportHeader, ReportMetric } from '../../../../components/reports/ReportNav';
import { moneda } from '../../../../lib/format';
import {
  conteoDe,
  getWorkerReport,
  montoDe,
  WorkerReport,
  WorkerReportRow,
} from '../../../../lib/worker-report';

type TabId = 'ventas' | 'pagos' | 'gastos';

const TABS: { id: TabId; label: string }[] = [
  { id: 'ventas', label: 'Ventas por método de pago' },
  { id: 'pagos', label: 'Pagos recibidos' },
  { id: 'gastos', label: 'Gastos que registró' },
];

/** Un trabajador entra en la tabla resumen si tuvo cualquier movimiento en el período. */
const tuvoMovimiento = (row: WorkerReportRow) =>
  row.ventas.count > 0 || row.pagosRecibidos.count > 0 || row.gastosRegistrados.count > 0;

export default function ReporteTrabajadoresPage() {
  const [report, setReport] = useState<WorkerReport | null>(null);
  const [rango, setRango] = useState<{ from: string; to: string } | null>(null);
  const [tab, setTab] = useState<TabId>('ventas');
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [loading, setLoading] = useState(true);

  const handlePeriod = useCallback((from: string, to: string) => {
    setRango({ from, to });
  }, []);

  useEffect(() => {
    // Se espera a que PeriodFilter publique su rango para no pedir dos veces al montar.
    if (!rango) return;
    setLoading(true);
    getWorkerReport(rango.from, rango.to)
      .then(setReport)
      .catch((cause) =>
        toast.error(
          cause instanceof Error ? cause.message : 'No se pudo cargar el reporte por trabajador',
        ),
      )
      .finally(() => setLoading(false));
  }, [rango]);

  const workers = report?.workers ?? [];
  const conMovimiento = useMemo(() => workers.filter(tuvoMovimiento), [workers]);
  const filas = mostrarTodos ? workers : conMovimiento;
  const sinMovimiento = workers.length - conMovimiento.length;
  const totals = report?.totals;

  return (
    <div className="module-page report-page">
      <ReportHeader eyebrow="Reportes" title="Reporte por trabajador" />

      <section className="report-metrics">
        <ReportMetric
          label="Vendido"
          value={moneda(totals?.montoVendido ?? 0)}
          detail={`${totals?.ventas ?? 0} ventas confirmadas, netas de devoluciones`}
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
          <div className="glass-table">
            <table>
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th>Ventas</th>
                  <th>Vendido</th>
                  <th>Pagos recibidos</th>
                  <th>Gastos que registró</th>
                </tr>
              </thead>
              <tbody>
                {filas.length ? (
                  filas.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.nombre}</strong>
                        <small>
                          {row.cargo}
                          {row.activo ? '' : ' · inactivo'}
                        </small>
                      </td>
                      <td>{row.ventas.count}</td>
                      <td>
                        <strong>{moneda(row.ventas.total)}</strong>
                      </td>
                      <td>
                        <strong>{moneda(row.pagosRecibidos.total)}</strong>
                        <small>{row.pagosRecibidos.count} pagos</small>
                      </td>
                      <td>
                        <strong>{moneda(row.gastosRegistrados.total)}</strong>
                        <small>{row.gastosRegistrados.count} gastos</small>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="table-empty">
                        <Users size={22} />
                        <span>Ningún trabajador tuvo movimiento en este período.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {sinMovimiento > 0 ? (
            <div className="module-tools report-filters">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setMostrarTodos((current) => !current)}
              >
                {mostrarTodos
                  ? 'Ocultar trabajadores sin movimiento'
                  : `Mostrar ${sinMovimiento} trabajador${sinMovimiento === 1 ? '' : 'es'} sin movimiento`}
              </button>
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
      <div className="table-empty report-tab-empty">
        {icon}
        <span>{filas.length ? sinColumnas : vacio}</span>
      </div>
    );
  }

  const totalColumna = (name: string) =>
    filas.reduce((sum, row) => sum + montoDe(breakdown(row), name), 0);

  return (
    <div className="glass-table">
      <table>
        <thead>
          <tr>
            <th>Trabajador</th>
            {columnas.map((name) => (
              <th key={name}>{name}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.nombre}</strong>
                <small>
                  {conteo(row)} {etiquetaConteo.toLowerCase()}
                </small>
              </td>
              {columnas.map((name) => {
                const amount = montoDe(breakdown(row), name);
                const count = conteoDe(breakdown(row), name);
                return (
                  <td key={name}>
                    {amount ? (
                      <>
                        <strong>{moneda(amount)}</strong>
                        <small>
                          {count} {count === 1 ? 'registro' : 'registros'}
                        </small>
                      </>
                    ) : (
                      <span className="report-cell-empty">—</span>
                    )}
                  </td>
                );
              })}
              <td>
                <strong>{moneda(total(row))}</strong>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            {columnas.map((name) => (
              <th key={name}>{moneda(totalColumna(name))}</th>
            ))}
            <th>{moneda(filas.reduce((sum, row) => sum + total(row), 0))}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
