'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getPurchases, Purchase } from '../../lib/operations';
import { money } from '../../lib/format';
import { PeriodFilter } from '../PeriodFilter';
import { ReportHeader, ReportMetric } from './ReportNav';

export function PurchaseReport() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const changePeriod = useCallback((start: string, end: string) => {
    setFrom(start);
    setTo(end);
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    getPurchases(from, to)
      .then(setPurchases)
      .catch((cause) =>
        toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar las compras'),
      )
      .finally(() => setLoading(false));
  }, [from, to]);

  // The date window is applied server-side (getPurchases(from, to)); the report covers
  // confirmed purchases, so both the table and the metrics use that set.
  const confirmed = useMemo(
    () => purchases.filter((item) => item.estado === 'CONFIRMADA'),
    [purchases],
  );
  const visible = confirmed;
  const total = confirmed.reduce((sum, item) => sum + item.totalNeto, 0);
  const paid = confirmed.reduce((sum, item) => sum + item.pagado, 0);
  const pending = confirmed.reduce((sum, item) => sum + item.saldo, 0);

  return (
    <div className="module-page report-page">
      <ReportHeader
        eyebrow="Reportes"
        title="Reporte de compras"
        description="Revisa las compras confirmadas a proveedores durante el período seleccionado."
      />
      <PeriodFilter onChange={changePeriod} />
      <section className="report-metrics">
        <ReportMetric label="Compras netas" value={money(total)} detail="Compras confirmadas" />
        <ReportMetric
          label="Operaciones"
          value={confirmed.length}
          detail="Documentos confirmados"
        />
        <ReportMetric label="Pagado" value={money(paid)} detail="Monto abonado" />
        <ReportMetric label="Pendiente" value={money(pending)} detail="Saldo por pagar" />
      </section>
      {loading ? (
        <div className="table-loading">
          <span className="loading-spinner" /> Cargando compras...
        </div>
      ) : (
        <div className="glass-table">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Comprobante</th>
                <th>Proveedor</th>
                <th>Almacén</th>
                <th>Total neto</th>
                <th>Pagado</th>
                <th>Saldo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {new Date(`${item.fecha.slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE')}
                    </td>
                    <td>
                      <strong>{item.comprobante}</strong>
                    </td>
                    <td>{item.proveedor}</td>
                    <td>{item.almacen}</td>
                    <td>{money(item.totalNeto)}</td>
                    <td>{money(item.pagado)}</td>
                    <td>{money(item.saldo)}</td>
                    <td>
                      <span
                        className={`status ${item.estado === 'CONFIRMADA' ? 'status-green' : 'status-amber'}`}
                      >
                        {item.estado}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="table-empty">No hay compras en el período seleccionado.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
