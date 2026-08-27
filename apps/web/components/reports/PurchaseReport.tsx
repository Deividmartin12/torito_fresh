'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPurchases, Purchase } from '../../lib/operations';
import { money } from '../../lib/format';
import { PeriodFilter } from '../PeriodFilter';
import { ReportHeader, ReportMetric } from './ReportNav';

export function PurchaseReport() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const changePeriod = useCallback((start: string, end: string) => {
    setFrom(start);
    setTo(end);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    getPurchases()
      .then(setPurchases)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las compras'),
      )
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () =>
      purchases.filter((item) => {
        const date = item.fecha.slice(0, 10);
        return (!from || date >= from) && (!to || date <= to);
      }),
    [from, purchases, to],
  );
  const confirmed = visible.filter((item) => item.estado === 'CONFIRMADA');
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
      {error ? (
        <div className="notice-error" role="alert">
          {error}
        </div>
      ) : null}
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
