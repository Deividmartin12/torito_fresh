'use client';

import { ChevronDown, Download } from 'lucide-react';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AnalyticsPeriod,
  BusinessAnalytics,
  fillDailySeries,
  fillMonthlySeries,
  getBusinessAnalytics,
  groupPeriodsByWeek,
  groupPeriodsByYear,
  PeriodBreakdownItem,
} from '../../lib/analytics';
import { moneda } from '../../lib/format';
import { PeriodFilter } from '../PeriodFilter';
import { Segmented } from '../Segmented';
import { ReportHeader } from './ReportNav';

type Grouping = 'dia' | 'semana' | 'mes' | 'anio';

// Para cada agrupación: etiqueta del segmento, qué representa una fila y el sustantivo
// singular/plural que usa el resumen que va encima de la tabla.
const groupings: Record<Grouping, { label: string; each: string; noun: [string, string] }> = {
  dia: { label: 'Día', each: 'un día', noun: ['día', 'días'] },
  semana: { label: 'Semana', each: 'una semana (lunes a domingo)', noun: ['semana', 'semanas'] },
  mes: { label: 'Mes', each: 'un mes', noun: ['mes', 'meses'] },
  anio: { label: 'Año', each: 'un año', noun: ['año', 'años'] },
};
const groupingOrder: Grouping[] = ['dia', 'semana', 'mes', 'anio'];

// Días mínimos que debe cubrir el rango para que una agrupación deje más de una fila. Por
// debajo de eso la opción se deshabilita: agruparía todo el período en un solo renglón.
const minSpanDays: Record<Grouping, number> = { dia: 1, semana: 14, mes: 60, anio: 730 };
const disabledHint: Record<Grouping, string> = {
  dia: '',
  semana: 'Disponible con un rango de 2 semanas o más',
  mes: 'Disponible con un rango de 2 meses o más',
  anio: 'Disponible con un rango de 2 años o más',
};

const localDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

function spanInDays(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
  return Math.round((end - start) / 86_400_000) + 1;
}

// Todas las categorías de un lado del reporte (formas de cobro o categorías de gasto),
// ordenadas por monto acumulado en el rango, de mayor a menor.
function breakdownColumns(
  rows: AnalyticsPeriod[],
  pick: (row: AnalyticsPeriod) => PeriodBreakdownItem[],
): string[] {
  const totals = new Map<string, number>();
  for (const row of rows)
    for (const item of pick(row)) totals.set(item.name, (totals.get(item.name) ?? 0) + item.amount);
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

// Monto por nombre de columna para una fila.
function amountsByColumn(items: PeriodBreakdownItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) out.set(item.name, (out.get(item.name) ?? 0) + item.amount);
  return out;
}

// Celda de monto: vacía (—) cuando es cero, para que la matriz se lea de un vistazo.
const celda = (value: number | undefined) => (value ? moneda(value) : '—');

// Descriptor de columna para los bloques de la matriz: encabezado, celda por fila y pie.
type Col = {
  key: string;
  header: ReactNode;
  cell: (row: AnalyticsPeriod) => ReactNode;
  foot: ReactNode;
  className?: string;
};

function MatrixBlock({
  cols,
  rows,
  className,
}: {
  cols: Col[];
  rows: AnalyticsPeriod[];
  className?: string;
}) {
  return (
    <table className={`sg-block ${className ?? ''}`}>
      <thead>
        <tr>
          {cols.map((col) => (
            <th key={col.key} className={col.className}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            {cols.map((col) => (
              <td key={col.key} className={col.className}>
                {col.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          {cols.map((col) => (
            <td key={col.key} className={col.className}>
              {col.foot}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

export function SummaryTableReport() {
  const [analytics, setAnalytics] = useState<BusinessAnalytics | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [grouping, setGrouping] = useState<Grouping>('dia');
  const [loading, setLoading] = useState(true);
  // Al inicio solo se ven los totales. Cada cabecera de total despliega sus propias
  // categorías, de forma independiente.
  const [verVentas, setVerVentas] = useState(false);
  const [verGastos, setVerGastos] = useState(false);

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

  // Agrupaciones con sentido para el rango elegido; las demás se muestran deshabilitadas.
  const enabledGroupings = useMemo(() => {
    const span = spanInDays(from, to);
    return new Set(groupingOrder.filter((option) => span >= minSpanDays[option]));
  }, [from, to]);

  // Si el rango se achica y la agrupación elegida deja de tener sentido, se cae a "Día".
  const activeGrouping: Grouping = enabledGroupings.has(grouping) ? grouping : 'dia';

  const rows: AnalyticsPeriod[] = useMemo(() => {
    if (!analytics) return [];
    switch (activeGrouping) {
      case 'dia':
        return fillDailySeries(analytics.daily, from, to);
      case 'semana':
        return groupPeriodsByWeek(fillDailySeries(analytics.daily, from, to));
      case 'mes':
        return fillMonthlySeries(analytics.monthly, from, to);
      case 'anio':
        return groupPeriodsByYear(analytics.monthly);
    }
  }, [analytics, activeGrouping, from, to]);

  // Una columna por forma de cobro (ventas) y una por categoría (gastos).
  const ventaCols = useMemo(() => breakdownColumns(rows, (row) => row.salesByPayment), [rows]);
  const gastoCols = useMemo(() => breakdownColumns(rows, (row) => row.expensesByCategory), [rows]);

  // Totales del período: el general y el de cada columna de desglose.
  const totales = useMemo(() => {
    const ventas = new Map<string, number>();
    const gastos = new Map<string, number>();
    let sales = 0;
    let expenses = 0;
    let production = 0;
    for (const row of rows) {
      sales += row.sales;
      expenses += row.expenses;
      production += row.production;
      for (const [col, value] of amountsByColumn(row.salesByPayment))
        ventas.set(col, (ventas.get(col) ?? 0) + value);
      for (const [col, value] of amountsByColumn(row.expensesByCategory))
        gastos.set(col, (gastos.get(col) ?? 0) + value);
    }
    return { sales, expenses, production, ventas, gastos };
  }, [rows]);

  // Cabecera de una columna de total: al hacer clic despliega/oculta sus categorías.
  const totalHeader = (label: string, open: boolean, toggle: () => void) => (
    <button
      type="button"
      className="sg-toggle"
      onClick={toggle}
      aria-expanded={open}
      title={open ? 'Ocultar categorías' : 'Ver categorías'}
    >
      {label}
      <ChevronDown size={13} className={open ? 'rotated' : ''} />
    </button>
  );

  // Bloque fijo: período.
  const periodoCols: Col[] = [
    {
      key: 'periodo',
      header: 'Período',
      className: 'sg-periodo',
      cell: (row) => row.label,
      foot: 'Total',
    },
  ];
  // Bloque fijo: total de ventas.
  const ventasTotalCols: Col[] = [
    {
      key: 'ventas-total',
      header: totalHeader('Ventas · Total', verVentas, () => setVerVentas((v) => !v)),
      className: 'num strong',
      cell: (row) => celda(row.sales),
      foot: celda(totales.sales),
    },
  ];
  // Bloque fijo: total de gastos.
  const gastosTotalCols: Col[] = [
    {
      key: 'gastos-total',
      header: totalHeader('Gastos · Total', verGastos, () => setVerGastos((v) => !v)),
      className: 'num strong',
      cell: (row) => celda(row.expenses),
      foot: celda(totales.expenses),
    },
  ];
  // Bloque derecho fijo: producción.
  const produccionCols: Col[] = [
    {
      key: 'produccion',
      header: 'Producción',
      className: 'num',
      cell: (row) => `${row.production.toFixed(0)} un.`,
      foot: `${totales.production.toFixed(0)} un.`,
    },
  ];
  // Columnas desplazables: una por cada forma de cobro / categoría de gasto.
  const buildSubCols = (
    names: string[],
    pick: (row: AnalyticsPeriod) => PeriodBreakdownItem[],
    totalsByName: Map<string, number>,
    vacio: string,
  ): Col[] =>
    names.length
      ? names.map((name) => ({
          key: name,
          header: name,
          className: 'num soft',
          cell: (row) => celda(amountsByColumn(pick(row)).get(name)),
          foot: celda(totalsByName.get(name)),
        }))
      : [{ key: '__none', header: vacio, className: 'num soft', cell: () => '—', foot: '—' }];
  const ventaSubCols = buildSubCols(
    ventaCols,
    (row) => row.salesByPayment,
    totales.ventas,
    'Sin ventas',
  );
  const gastoSubCols = buildSubCols(
    gastoCols,
    (row) => row.expensesByCategory,
    totales.gastos,
    'Sin gastos',
  );

  function exportReport() {
    if (!rows.length) return;
    const csvRows: (string | number)[][] = [
      ['Periodo', 'Ventas (S/)', ...ventaCols, 'Gastos (S/)', ...gastoCols, 'Producción'],
    ];
    for (const row of rows) {
      const ventas = amountsByColumn(row.salesByPayment);
      const gastos = amountsByColumn(row.expensesByCategory);
      csvRows.push([
        row.label,
        row.sales.toFixed(2),
        ...ventaCols.map((col) => (ventas.get(col) ?? 0).toFixed(2)),
        row.expenses.toFixed(2),
        ...gastoCols.map((col) => (gastos.get(col) ?? 0).toFixed(2)),
        row.production.toFixed(2),
      ]);
    }
    csvRows.push([
      'Total',
      totales.sales.toFixed(2),
      ...ventaCols.map((col) => (totales.ventas.get(col) ?? 0).toFixed(2)),
      totales.expenses.toFixed(2),
      ...gastoCols.map((col) => (totales.gastos.get(col) ?? 0).toFixed(2)),
      totales.production.toFixed(2),
    ]);
    const csv = `﻿${csvRows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-resumen-${activeGrouping}-${from || 'inicio'}-${to || localDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const countNoun = groupings[activeGrouping].noun[rows.length === 1 ? 0 : 1];

  return (
    <div className="module-page report-page">
      <ReportHeader eyebrow="Reportes" title="Resumen diario" />

      <div className="summary-filters">
        <div className="summary-filter-step">
          <span className="summary-filter-label">Ver por</span>
          <PeriodFilter onChange={changePeriod} />
        </div>

        <div className="summary-filter-step">
          <span className="summary-filter-label">Agrupado por</span>
          <Segmented
            ariaLabel="Agrupar las filas por"
            value={activeGrouping}
            onChange={(next) => setGrouping(next as Grouping)}
            options={groupingOrder.map((option) => ({
              value: option,
              label: groupings[option].label,
              disabled: !enabledGroupings.has(option),
              title: enabledGroupings.has(option) ? undefined : disabledHint[option],
            }))}
          />
        </div>
      </div>

      {from && to ? (
        <div className="summary-readout">
          <span className="summary-readout-count">
            {loading ? 'Calculando…' : `${rows.length} ${countNoun}`}
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
          <span className="loading-spinner" /> Calculando el resumen...
        </div>
      ) : rows.length ? (
        <div className="summary-grid">
          <MatrixBlock cols={periodoCols} rows={rows} className="sg-fixed" />
          <MatrixBlock cols={ventasTotalCols} rows={rows} className="sg-fixed" />
          {verVentas ? (
            <div className="sg-scroll">
              <MatrixBlock cols={ventaSubCols} rows={rows} />
            </div>
          ) : null}
          <MatrixBlock cols={gastosTotalCols} rows={rows} className="sg-fixed" />
          {verGastos ? (
            <div className="sg-scroll">
              <MatrixBlock cols={gastoSubCols} rows={rows} />
            </div>
          ) : null}
          <MatrixBlock cols={produccionCols} rows={rows} className="sg-fixed sg-right" />
        </div>
      ) : (
        <div className="table-empty">No hay datos para el rango seleccionado.</div>
      )}
    </div>
  );
}
