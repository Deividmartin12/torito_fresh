'use client';

import { ChevronDown, Download } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { aparece, retraso } from '../charts/animacion';
import { PeriodFilter } from '../PeriodFilter';
import { Segmented } from '../Segmented';
import { useUnidad } from '../UnidadProvider';
import { ReportHeader } from './ReportNav';

type Grouping = 'dia' | 'semana' | 'mes' | 'anio';

const groupingOptions: { value: Grouping; label: string; noun: [string, string] }[] = [
  { value: 'dia', label: 'Día', noun: ['día', 'días'] },
  { value: 'semana', label: 'Semana', noun: ['semana', 'semanas'] },
  { value: 'mes', label: 'Mes', noun: ['mes', 'meses'] },
  { value: 'anio', label: 'Año', noun: ['año', 'años'] },
];

const localDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
const displayDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return day && month && year ? `${day}/${month}/${year}` : value;
};

export function SummaryTableReport() {
  const [analytics, setAnalytics] = useState<BusinessAnalytics | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [etiquetaPeriodo, setEtiquetaPeriodo] = useState('');
  const [grouping, setGrouping] = useState<Grouping>('dia');
  const [salesExpanded, setSalesExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  // Solo dispara la recarga: la unidad viaja al API desde `api()`.
  const { clave: unidad, resumen: unidadResumen } = useUnidad();

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
  }, [from, to, unidad]);

  const changePeriod = useCallback((start: string, end: string, meta: { label: string }) => {
    setFrom(start);
    setTo(end);
    setEtiquetaPeriodo(meta.label);
  }, []);

  const rows: AnalyticsPeriod[] = useMemo(() => {
    if (!analytics) return [];
    const daily = fillDailySeries(analytics.daily, from, to);
    if (grouping === 'dia') return daily;
    if (grouping === 'semana') return groupPeriodsByWeek(daily);
    const monthly = fillMonthlySeries(analytics.monthly, from, to);
    return grouping === 'mes' ? monthly : groupPeriodsByYear(monthly);
  }, [analytics, from, grouping, to]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          sales: acc.sales + row.sales,
          expenses: acc.expenses + row.expenses,
          production: acc.production + row.production,
          salesByCategory: row.salesByPayment.reduce(
            (categories, item) =>
              categories.set(item.name, (categories.get(item.name) ?? 0) + item.amount),
            acc.salesByCategory,
          ),
        }),
        { sales: 0, expenses: 0, production: 0, salesByCategory: new Map<string, number>() },
      ),
    [rows],
  );

  const salesCategories = useMemo(
    () =>
      [...totals.salesByCategory.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([name]) => name),
    [totals.salesByCategory],
  );

  const rowLabel = useCallback(
    (row: AnalyticsPeriod) => (grouping === 'dia' ? displayDate(row.key) : row.label),
    [grouping],
  );

  function exportReport() {
    if (!rows.length) return;

    const csvRows: (string | number)[][] = [
      [
        grouping === 'dia' ? 'Fecha' : 'Período',
        'Ventas (S/)',
        'Gastos (S/)',
        'Bidones producidos',
      ],
      ...rows.map((row) => [
        rowLabel(row),
        row.sales.toFixed(2),
        row.expenses.toFixed(2),
        row.production.toFixed(0),
      ]),
      ['Total', totals.sales.toFixed(2), totals.expenses.toFixed(2), totals.production.toFixed(0)],
    ];
    const csv = `﻿${csvRows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-resumen-${grouping}-${from || 'inicio'}-${to || localDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="module-page report-page">
      <ReportHeader
        eyebrow="Reportes"
        title={etiquetaPeriodo ? `Reporte diario · ${etiquetaPeriodo}` : 'Reporte diario'}
        caption={unidadResumen ? `Alcance: ${unidadResumen}` : undefined}
      />

      <div className="summary-filters">
        <div className="summary-filter-step">
          <span className="summary-filter-label">Período</span>
          <PeriodFilter onChange={changePeriod} />
        </div>
        <div className="summary-filter-step">
          <span className="summary-filter-label">Agrupar por</span>
          <Segmented
            ariaLabel="Agrupar filas del resumen"
            value={grouping}
            onChange={(value) => setGrouping(value as Grouping)}
            options={groupingOptions.map(({ value, label }) => ({ value, label }))}
          />
        </div>
      </div>

      {from && to ? (
        <div className="summary-readout">
          <span className="summary-readout-count">
            {loading
              ? 'Calculando…'
              : `${rows.length} ${
                  groupingOptions.find((item) => item.value === grouping)?.noun[
                    rows.length === 1 ? 0 : 1
                  ]
                }`}
          </span>
          <button
            type="button"
            className="report-export-button"
            onClick={exportReport}
            disabled={!rows.length || loading}
          >
            <Download size={16} /> Exportar CSV
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="table-loading">
          <span className="loading-spinner" /> Calculando el reporte...
        </div>
      ) : rows.length ? (
        <div className="summary-grid summary-grid-simple">
          <table
            className={`summary-daily-table ${salesExpanded ? 'is-sales-expanded' : ''}`}
            style={
              salesExpanded ? { minWidth: `${600 + salesCategories.length * 140}px` } : undefined
            }
          >
            <thead>
              <tr>
                <th className="sg-periodo">{grouping === 'dia' ? 'Fecha' : 'Período'}</th>
                <th className="num">
                  <button
                    type="button"
                    className="summary-sales-toggle"
                    onClick={() => setSalesExpanded((current) => !current)}
                    aria-expanded={salesExpanded}
                    disabled={!salesCategories.length}
                    title={
                      !salesCategories.length
                        ? 'No hay categorías de venta en el período'
                        : salesExpanded
                          ? 'Ocultar ventas por categoría de cobro'
                          : 'Mostrar ventas por categoría de cobro'
                    }
                  >
                    Ventas
                    <ChevronDown size={14} className={salesExpanded ? 'rotated' : ''} />
                  </button>
                </th>
                {salesExpanded
                  ? salesCategories.map((category) => (
                      <th className="num summary-sales-category-column" key={category}>
                        {category}
                      </th>
                    ))
                  : null}
                <th className="num">Gastos</th>
                <th className="num">Bidones producidos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key} className={aparece} style={retraso(index, 15)}>
                  <td className="sg-periodo">{rowLabel(row)}</td>
                  <td className="num strong">{moneda(row.sales)}</td>
                  {salesExpanded
                    ? salesCategories.map((category) => {
                        const amount = row.salesByPayment.find(
                          (item) => item.name === category,
                        )?.amount;
                        return (
                          <td className="num soft summary-sales-category-column" key={category}>
                            {amount ? moneda(amount) : '—'}
                          </td>
                        );
                      })
                    : null}
                  <td className="num strong">{moneda(row.expenses)}</td>
                  <td className="num">{row.production.toFixed(0)} un.</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="sg-periodo">Total</td>
                <td className="num strong">{moneda(totals.sales)}</td>
                {salesExpanded
                  ? salesCategories.map((category) => (
                      <td className="num strong summary-sales-category-column" key={category}>
                        {moneda(totals.salesByCategory.get(category) ?? 0)}
                      </td>
                    ))
                  : null}
                <td className="num strong">{moneda(totals.expenses)}</td>
                <td className="num">{totals.production.toFixed(0)} un.</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="table-empty">No hay datos para el rango seleccionado.</div>
      )}
    </div>
  );
}
