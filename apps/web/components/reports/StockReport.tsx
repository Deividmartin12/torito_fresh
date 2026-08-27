'use client';

import { AlertTriangle, Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { TopProductRow } from '../../lib/dashboard';
import { money } from '../../lib/format';
import { getOperationStock, StockRow } from '../../lib/operations';
import { ProductRankingChart } from '../charts/BusinessCharts';
import { ReportHeader, ReportMetric } from './ReportNav';

export function StockReport() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [warehouse, setWarehouse] = useState('Todos');
  const [state, setState] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getOperationStock()
      .then(setStock)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar el stock'),
      )
      .finally(() => setLoading(false));
  }, []);

  const warehouses = [...new Set(stock.map((row) => row.almacen))];
  const states = [...new Set(stock.map((row) => row.estado))];
  const filtered = useMemo(
    () =>
      stock.filter(
        (row) =>
          (warehouse === 'Todos' || row.almacen === warehouse) &&
          (state === 'Todos' || row.estado === state),
      ),
    [state, stock, warehouse],
  );
  const available = filtered.reduce(
    (sum, row) => sum + Math.max(row.cantidad - row.reservada, 0),
    0,
  );
  const reserved = filtered.reduce((sum, row) => sum + row.reservada, 0);
  const low = filtered.filter((row) => row.cantidad - row.reservada < row.minimo);
  const valuation = filtered.reduce((sum, row) => sum + row.cantidad * row.costo, 0);
  const warehouseChart = useMemo<TopProductRow[]>(
    () =>
      [...new Set(filtered.map((row) => row.almacen))]
        .map((name) => ({
          product: { id: name, name },
          quantity: filtered
            .filter((row) => row.almacen === name)
            .reduce((sum, row) => sum + Math.max(row.cantidad - row.reservada, 0), 0),
          total: filtered
            .filter((row) => row.almacen === name)
            .reduce((sum, row) => sum + row.cantidad * row.costo, 0),
        }))
        .sort((a, b) => b.quantity - a.quantity),
    [filtered],
  );

  function exportStock() {
    const rows = [
      [
        'Producto',
        'Código',
        'Almacén',
        'Lote',
        'Estado',
        'Cantidad',
        'Reservada',
        'Disponible',
        'Costo promedio',
        'Valorización',
      ],
      ...filtered.map((row) => [
        row.producto,
        row.codigo,
        row.almacen,
        row.lote,
        row.estado,
        row.cantidad,
        row.reservada,
        Math.max(row.cantidad - row.reservada, 0),
        row.costo.toFixed(4),
        (row.cantidad * row.costo).toFixed(2),
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="module-page report-page">
      <ReportHeader
        eyebrow="Reportes"
        title="Reporte de stock actual"
        description="Consulta disponibilidad, reservas, mínimos y valorización por almacen."
      />
      <section className="report-metrics">
        <ReportMetric
          label="Disponible real"
          value={available}
          detail={`${filtered.length} posiciones`}
        />
        <ReportMetric label="Reservado" value={reserved} detail="Unidades comprometidas" />
        <ReportMetric
          label="Bajo minimo"
          value={low.length}
          detail="Posiciones que requieren atención"
        />
        <ReportMetric
          label="Valorización"
          value={money(valuation)}
          detail="Cantidad por costo promedio"
        />
      </section>
      <div className="module-tools report-filters">
        <select
          className="filter-pill"
          value={warehouse}
          onChange={(event) => setWarehouse(event.target.value)}
          aria-label="Filtrar por almacén"
        >
          <option>Todos</option>
          {warehouses.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          className="filter-pill"
          value={state}
          onChange={(event) => setState(event.target.value)}
          aria-label="Filtrar por estado"
        >
          <option>Todos</option>
          {states.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button
          type="button"
          className="report-clear-filter"
          onClick={() => {
            setWarehouse('Todos');
            setState('Todos');
          }}
        >
          Restablecer filtros
        </button>
        <button
          type="button"
          className="report-export-button"
          onClick={exportStock}
          disabled={!filtered.length}
        >
          <Download size={16} /> Exportar CSV
        </button>
      </div>
      {error ? <div className="notice-error">{error}</div> : null}
      {loading ? (
        <div className="table-loading">
          <span className="loading-spinner" /> Cargando stock...
        </div>
      ) : (
        <>
          <div className="report-single-chart">
            <ProductRankingChart
              data={warehouseChart}
              title="Disponibilidad por almacen"
              subtitle="Unidades disponibles y valorización actual"
              unitLabel="un."
            />
          </div>
          {low.length ? (
            <div className="stock-report-alert">
              <AlertTriangle size={18} />
              <span>
                {low.length} posiciones están por debajo de su stock mínimo. Revísalas desde el
                módulo de inventario.
              </span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
