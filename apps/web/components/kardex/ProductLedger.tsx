'use client';

import { Download, PackageSearch } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { moneda, cantidad } from '../../lib/format';
import {
  CatalogItem,
  KardexLedger,
  getKardex,
  getOperationCatalogs,
} from '../../lib/operations';
import { PeriodFilter } from '../PeriodFilter';
import { SearchableSelect } from '../SearchableSelect';

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export function ProductLedger({
  initialProductId = '',
  initialWarehouseId = '',
}: {
  initialProductId?: string;
  initialWarehouseId?: string;
}) {
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [warehouses, setWarehouses] = useState<CatalogItem[]>([]);
  const [productId, setProductId] = useState(initialProductId);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [ledger, setLedger] = useState<KardexLedger | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getOperationCatalogs()
      .then((catalogs) => {
        setProducts(catalogs.productos);
        setWarehouses(catalogs.almacenes);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (!productId) {
      setLedger(null);
      return;
    }
    setLoading(true);
    try {
      setLedger(
        await getKardex({
          productoId: productId,
          almacenId: warehouseId || undefined,
          from: from || undefined,
          to: to || undefined,
        }),
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo cargar el kardex del producto');
    } finally {
      setLoading(false);
    }
  }, [from, productId, to, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changePeriod = useCallback((start: string, end: string) => {
    setFrom(start);
    setTo(end);
  }, []);

  const productOptions = useMemo(
    () => products.map((item) => ({ value: item.id, label: item.nombre })),
    [products],
  );
  const warehouseOptions = useMemo(
    () => [
      { value: '', label: 'Todos los almacenes' },
      ...warehouses.map((item) => ({ value: item.id, label: item.nombre })),
    ],
    [warehouses],
  );

  function exportCsv() {
    if (!ledger) return;
    const rows: (string | number)[][] = [
      ['Fecha', 'Documento', 'Movimiento', 'Entrada', 'Salida', 'Saldo', 'Costo unitario'],
      ['', 'Saldo inicial', '', '', '', cantidad(ledger.saldoInicial), ''],
      ...ledger.movimientos.map((row) => [
        new Date(row.fecha).toLocaleDateString('es-PE'),
        row.documento,
        row.operacionLabel,
        row.entrada ? cantidad(row.entrada) : '',
        row.salida ? cantidad(row.salida) : '',
        cantidad(row.saldo),
        row.costoUnitario.toFixed(4),
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `kardex-${ledger.producto.nombre}-${from || 'inicio'}-${to || 'hoy'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="kardex-ledger">
      <div className="module-tools kardex-ledger-filters">
        <SearchableSelect
          value={productId}
          onChange={setProductId}
          options={productOptions}
          placeholder="Elegir producto"
          className="kardex-ledger-product"
        />
        <SearchableSelect
          value={warehouseId}
          onChange={setWarehouseId}
          options={warehouseOptions}
          placeholder="Almacén"
        />
        <button
          type="button"
          className="report-export-button"
          onClick={exportCsv}
          disabled={!ledger || !ledger.movimientos.length}
        >
          <Download size={16} /> Exportar CSV
        </button>
      </div>
      <PeriodFilter onChange={changePeriod} />

      {!productId ? (
        <div className="empty-state">
          <PackageSearch size={34} />
          <h2>Elige un producto</h2>
          <p>Selecciona un producto para ver su kardex: entradas, salidas y saldo en el tiempo.</p>
        </div>
      ) : loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Calculando el kardex del producto...
        </div>
      ) : ledger ? (
        <>
          <div className="kardex-ledger-head">
            <strong>{ledger.producto.nombre}</strong>
            <small>
              {ledger.producto.codigo || 'Sin código'} · {ledger.almacen}
            </small>
          </div>
          <div className="glass-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Documento</th>
                  <th>Movimiento</th>
                  <th className="num">Entrada</th>
                  <th className="num">Salida</th>
                  <th className="num">Saldo</th>
                  <th className="num">Costo unit.</th>
                </tr>
              </thead>
              <tbody>
                <tr className="kardex-ledger-opening">
                  <td colSpan={5}>Saldo inicial del período</td>
                  <td className="num">
                    <strong>{cantidad(ledger.saldoInicial)}</strong>
                  </td>
                  <td className="num" />
                </tr>
                {ledger.movimientos.length ? (
                  ledger.movimientos.map((row) => (
                    <tr key={row.detalleId}>
                      <td>{new Date(row.fecha).toLocaleDateString('es-PE')}</td>
                      <td>
                        <strong>{row.documento}</strong>
                        <small>{row.tercero}</small>
                      </td>
                      <td>
                        <span
                          className={`status ${row.direccion === 'ENTRADA' ? 'status-green' : 'status-blue'}`}
                        >
                          {row.operacionLabel}
                        </span>
                        <small>
                          {row.lote} · {row.estadoInventario}
                        </small>
                      </td>
                      <td className="num">{row.entrada ? `+ ${cantidad(row.entrada)}` : '—'}</td>
                      <td className="num">{row.salida ? `− ${cantidad(row.salida)}` : '—'}</td>
                      <td className="num">
                        <strong>{cantidad(row.saldo)}</strong>
                      </td>
                      <td className="num">{moneda(row.costoUnitario)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <div className="table-empty">
                        Este producto no tuvo movimientos en el período seleccionado.
                      </div>
                    </td>
                  </tr>
                )}
                <tr className="kardex-ledger-closing">
                  <td colSpan={5}>Saldo final</td>
                  <td className="num">
                    <strong>{cantidad(ledger.saldoFinal)}</strong>
                  </td>
                  <td className="num" />
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
