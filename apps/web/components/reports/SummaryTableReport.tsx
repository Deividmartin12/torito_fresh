'use client';

import { Download } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AnalyticsPeriod,
  BusinessAnalytics,
  fillDailySeries,
  fillMonthlySeries,
  getBusinessAnalytics,
  groupPeriodsByWeek,
  groupPeriodsByYear,
} from '../../lib/analytics';
import { moneda } from '../../lib/format';
import { PeriodFilter } from '../PeriodFilter';
import { ReportHeader } from './ReportNav';

type View = 'dia' | 'semana' | 'mes' | 'anio';
const views: { value: View; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'anio', label: 'Año' },
];

const localDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export function SummaryTableReport() {
  const [analytics, setAnalytics] = useState<BusinessAnalytics | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState<View>('dia');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Espera a que PeriodFilter publique su rango antes del primer pedido, para no mostrar
    // brevemente la ventana de 12 meses por defecto del backend.
    if (!from || !to) return;
    setLoading(true);
    getBusinessAnalytics(from, to)
      .then(setAnalytics)
      .catch((cause) =>
        toast.error(cause instanceof Error ? cause.message : 'No se pudo calcular el resumen'),
      )
      .finally(() => setLoading(false));
  }, [from, to]);

  const changePeriod = useCallback((start: string, end: string) => {
    setFrom(start);
    setTo(end);
  }, []);

  const rows: AnalyticsPeriod[] = (() => {
    if (!analytics) return [];
    switch (view) {
      case 'dia':
        return fillDailySeries(analytics.daily, from, to);
      case 'semana':
        return groupPeriodsByWeek(fillDailySeries(analytics.daily, from, to));
      case 'mes':
        return fillMonthlySeries(analytics.monthly, from, to);
      case 'anio':
        return groupPeriodsByYear(analytics.monthly);
    }
  })();

  function exportReport() {
    if (!rows.length) return;
    const csvRows: (string | number)[][] = [
      ['Periodo', 'Ventas (S/)', 'Gastos (S/)', 'Producción'],
      ...rows.map((row) => [
        row.label,
        row.sales.toFixed(2),
        row.expenses.toFixed(2),
        row.production.toFixed(2),
      ]),
    ];
    const csv = `﻿${csvRows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-resumen-${view}-${from || 'inicio'}-${to || localDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="module-page report-page">
      <ReportHeader
        eyebrow="Reportes"
        title="Resumen diario"
        description="Ventas, gastos y producción del período, agrupados por día, semana, mes o año."
      />
      <PeriodFilter onChange={changePeriod} />
      <div className="module-tools report-filters">
        <div className="report-period-shortcuts" role="group" aria-label="Agrupar por">
          {views.map((item) => (
            <button
              key={item.value}
              type="button"
              className={view === item.value ? 'active' : ''}
              onClick={() => setView(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="report-export-button"
          onClick={exportReport}
          disabled={!rows.length || loading}
        >
          <Download size={16} /> Exportar CSV
        </button>
      </div>
      {loading ? (
        <div className="table-loading">
          <span className="loading-spinner" /> Calculando el resumen...
        </div>
      ) : rows.length ? (
        <div className="glass-table">
          <table>
            <thead>
              <tr>
                <th>Período</th>
                <th>Ventas</th>
                <th>Gastos</th>
                <th>Producción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>{moneda(row.sales)}</td>
                  <td>{moneda(row.expenses)}</td>
                  <td>{row.production.toFixed(0)} un.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-empty">No hay datos para el rango seleccionado.</div>
      )}
    </div>
  );
}
