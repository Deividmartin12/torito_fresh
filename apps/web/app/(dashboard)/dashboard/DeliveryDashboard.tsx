'use client';

import { HandCoins, PackageCheck, ReceiptText, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DeliverySummary, getDeliverySummary } from '../../../lib/dashboard';
import { estadoPagoLabel } from '../../../lib/credit';
import { money } from '../../../lib/format';
import { DashboardKpi } from './DashboardKpi';

export function DeliveryDashboard() {
  const [data, setData] = useState<DeliverySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getDeliverySummary());
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo cargar el resumen', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totales = data?.totales;

  return (
    <div className="module-page business-dashboard">
      <div className="dashboard-head">
        <div>
          <h1>Mi resumen del día</h1>
          <span className="operation-eyebrow dashboard-period-label">
            {data ? new Date(`${data.fecha}T00:00:00`).toLocaleDateString('es-PE') : ''}
          </span>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'dashboard-spinning' : ''} /> Actualizar
        </button>
      </div>

      {loading && !data ? (
        <div className="dashboard-loading" role="status">
          <span className="loading-spinner" /> Cargando tu resumen...
        </div>
      ) : null}

      {data ? (
        <>
          <section className="dashboard-kpis" aria-label="Indicadores del día">
            <DashboardKpi
              icon={<ReceiptText size={21} />}
              label="Ventas de hoy"
              value={totales?.ventas ?? 0}
              detail="Operaciones que registraste"
              tone="blue"
            />
            <DashboardKpi
              icon={<PackageCheck size={21} />}
              label="Monto vendido"
              value={money(totales?.monto)}
              detail="Total del día"
              tone="green"
            />
            <DashboardKpi
              icon={<HandCoins size={21} />}
              label="Cobrado"
              value={money(totales?.cobrado)}
              detail="Pagado al momento de la venta"
              tone="amber"
            />
          </section>

          <div className="glass-table">
            <table>
              <thead>
                <tr>
                  <th>Venta</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length ? (
                  data.items.map((item) => (
                    <tr key={item.codigo}>
                      <td>
                        <strong>{item.codigo}</strong>
                      </td>
                      <td>{item.cliente}</td>
                      <td>{money(item.total)}</td>
                      <td>{estadoPagoLabel[item.estadoPago] ?? item.estadoPago}</td>
                      <td>
                        <span
                          className={
                            item.estado === 'CONFIRMADA'
                              ? 'status status-green'
                              : 'status status-amber'
                          }
                        >
                          {item.estado}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="table-empty">Todavía no registraste ventas hoy.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
