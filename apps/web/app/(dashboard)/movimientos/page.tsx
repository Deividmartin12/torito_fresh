'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Boxes, Eye, FileText, Search, UserRound, Warehouse, X } from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { PeriodFilter } from '../../../components/PeriodFilter';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { modalActionsClass } from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { Modal, ModalHeader } from '../../../components/ui/Modal';
import { ProductLedger } from '../../../components/kardex/ProductLedger';
import { fechaHora, moneda, cantidad } from '../../../lib/format';
import { MOVEMENT_TYPE_OPTIONS, directionLabel, movementStyle } from '../../../lib/kardex';
import { CatalogItem, Movement, getMovements, getOperationCatalogs } from '../../../lib/operations';

type Tab = 'movimientos' | 'producto';

export default function MovimientosPage() {
  return (
    <Suspense fallback={<div className="module-page kardex-page" />}>
      <MovimientosView />
    </Suspense>
  );
}

function MovimientosView() {
  const params = useSearchParams();
  const tabParam = params.get('tab');
  const productoParam = params.get('productoId') ?? '';
  const almacenParam = params.get('almacenId') ?? '';
  const [tab, setTab] = useState<Tab>(tabParam === 'producto' ? 'producto' : 'movimientos');
  useEffect(() => {
    if (tabParam === 'producto') setTab('producto');
  }, [tabParam]);

  const [buscar, setBuscar] = useState('');
  const [ref, setRef] = useState(params.get('ref') ?? '');
  const [tipoOperacion, setTipoOperacion] = useState('');
  const [productoId, setProductoId] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [seleccionado, setSeleccionado] = useState<Movement | null>(null);

  const catalogsQuery = useQuery({
    queryKey: ['operation-catalogs'],
    queryFn: getOperationCatalogs,
    retry: false,
  });
  const productos = catalogsQuery.data?.productos ?? [];
  const almacenes = catalogsQuery.data?.almacenes ?? [];

  const filtros = { from, to, productoId, almacenId, tipoOperacion, ref };
  const movimientosQuery = useQuery({
    queryKey: ['movements', filtros],
    queryFn: () =>
      getMovements({
        from: from || undefined,
        to: to || undefined,
        productoId: productoId || undefined,
        almacenId: almacenId || undefined,
        tipoOperacion: tipoOperacion || undefined,
        ref: ref || undefined,
      }),
    enabled: tab === 'movimientos',
  });
  const movimientos = movimientosQuery.data ?? [];
  const loading = movimientosQuery.isPending;
  const load = movimientosQuery.refetch;
  useEffect(() => {
    if (movimientosQuery.error) {
      toast.error(
        movimientosQuery.error instanceof Error
          ? movimientosQuery.error.message
          : 'No se pudo cargar el kardex',
      );
    }
  }, [movimientosQuery.error]);

  const changePeriod = useCallback((start: string, end: string) => {
    setFrom(start);
    setTo(end);
  }, []);

  // Los filtros de fecha/producto/almacén/tipo/ref se aplican en el servidor; aquí solo se
  // refina por texto, y DataTable pagina en el cliente.
  const filtradas = useMemo(() => {
    const needle = buscar.trim().toLowerCase();
    if (!needle) return movimientos;
    return movimientos.filter((item) =>
      `${item.referencia} ${item.operacionLabel} ${item.comprobante} ${item.tercero} ${item.origen} ${item.destino}`
        .toLowerCase()
        .includes(needle),
    );
  }, [buscar, movimientos]);

  const hasFilters = Boolean(
    buscar || ref || tipoOperacion || productoId || almacenId || from || to,
  );

  const movementColumns: DataTableColumn<Movement>[] = [
    {
      key: 'movimiento',
      header: 'Movimiento',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.referencia}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">{fechaHora(item.fecha)}</small>
        </>
      ),
    },
    {
      key: 'ocurrio',
      header: 'Qué ocurrió',
      render: (item) => {
        const style = movementStyle(item.tipo);
        const Icon = style.icon;
        return (
          <>
            <Badge tone={style.tone}>
              <Icon size={13} /> {style.label}
            </Badge>
            <small className="mt-0.5 block text-[11px] text-muted">{item.operacionLabel}</small>
          </>
        );
      },
    },
    {
      key: 'documento',
      header: 'Documento y tercero',
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.comprobante}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">{item.tercero}</small>
        </>
      ),
    },
    {
      key: 'ruta',
      header: 'Ruta del inventario',
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.origen}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">Hacia: {item.destino}</small>
        </>
      ),
    },
    {
      key: 'productos',
      header: 'Productos',
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">
            {item.detalles.length} {item.detalles.length === 1 ? 'producto' : 'productos'}
          </strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {cantidad(item.unidades)} unidades en total
          </small>
        </>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => (
        <Badge tone={item.estado === 'CONFIRMADO' ? 'green' : 'amber'}>
          {item.estado === 'CONFIRMADO' ? 'Confirmado' : item.estado}
        </Badge>
      ),
    },
    {
      key: 'ver',
      header: 'Ver',
      cardLabel: null,
      render: (item) => (
        <IconButton
          onClick={() => setSeleccionado(item)}
          title="Ver cómo cambió el stock"
          aria-label={`Ver detalle del movimiento ${item.referencia}`}
        >
          <Eye size={16} />
        </IconButton>
      ),
    },
  ];

  return (
    <div className="module-page kardex-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Kardex de inventario</h1>
        </div>
      </div>

      <div className="module-tools kardex-tabs">
        <div className="report-period-shortcuts">
          <button
            type="button"
            className={tab === 'movimientos' ? 'active' : ''}
            onClick={() => setTab('movimientos')}
          >
            Movimientos
          </button>
          <button
            type="button"
            className={tab === 'producto' ? 'active' : ''}
            onClick={() => setTab('producto')}
          >
            Kardex por producto
          </button>
        </div>
      </div>

      {tab === 'producto' ? (
        <ProductLedger
          key={`${productoParam}-${almacenParam}`}
          initialProductId={productoParam}
          initialWarehouseId={almacenParam}
        />
      ) : (
        <>
          <div className="module-tools kardex-filters">
            <label className="pill-search">
              <Search size={17} />
              <input
                value={buscar}
                onChange={(event) => setBuscar(event.target.value)}
                placeholder="Buscar documento, referencia o tercero"
              />
            </label>
            <select
              className="filter-pill"
              value={tipoOperacion}
              onChange={(event) => setTipoOperacion(event.target.value)}
              aria-label="Tipo de movimiento"
            >
              {MOVEMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <SearchableSelect
              value={productoId}
              onChange={setProductoId}
              options={[
                { value: '', label: 'Todos los productos' },
                ...productos.map((item) => ({ value: item.id, label: item.nombre })),
              ]}
              placeholder="Producto"
            />
            <SearchableSelect
              value={almacenId}
              onChange={setAlmacenId}
              options={[
                { value: '', label: 'Todos los almacenes' },
                ...almacenes.map((item) => ({ value: item.id, label: item.nombre })),
              ]}
              placeholder="Almacén"
            />
          </div>
          <PeriodFilter onChange={changePeriod} />

          {ref ? (
            <div className="kardex-ref-chip">
              Mostrando el movimiento <strong>{ref}</strong>
              <button type="button" onClick={() => setRef('')}>
                <X size={13} /> Quitar
              </button>
            </div>
          ) : null}

          <DataTable
            columns={movementColumns}
            rows={filtradas}
            rowKey={(item) => item.id}
            loading={loading}
            loadingLabel="Cargando movimientos..."
            pageSize={50}
            emptyMessage={
              <div className="flex flex-col items-center gap-2.5">
                <Search size={22} />
                <span>
                  {hasFilters
                    ? 'No hay movimientos que coincidan con los filtros.'
                    : 'Aún no hay movimientos de inventario registrados.'}
                </span>
              </div>
            }
          />
        </>
      )}

      {seleccionado ? (
        <MovementDetail movement={seleccionado} onClose={() => setSeleccionado(null)} />
      ) : null}
    </div>
  );
}

function MovementDetail({ movement, onClose }: { movement: Movement; onClose: () => void }) {
  const style = movementStyle(movement.tipo);
  return (
    <Modal onClose={onClose} className="max-w-[900px]">
      <ModalHeader
        title={movement.referencia}
        subtitle={`${movement.operacionLabel} · ${movement.comprobante} · ${fechaHora(movement.fecha)}`}
        onClose={onClose}
      />
      <div className="operation-detail kardex-detail">
        <p className="kardex-explanation">{movement.explicacion}</p>
        <div className="kardex-summary-grid">
          <div>
            <FileText size={17} />
            <span>
              Documento<strong>{movement.comprobante}</strong>
              <small>{movement.tercero}</small>
            </span>
          </div>
          <div>
            <Boxes size={17} />
            <span>
              Movimiento<strong>{style.label}</strong>
              <small>{cantidad(movement.unidades)} unidades</small>
            </span>
          </div>
          <div>
            <UserRound size={17} />
            <span>
              Responsable<strong>{movement.responsable}</strong>
              <small>{movement.estado === 'CONFIRMADO' ? 'Confirmado' : movement.estado}</small>
            </span>
          </div>
        </div>
        <div className="kardex-route">
          <div>
            <small>Sale de</small>
            <strong>{movement.origen}</strong>
          </div>
          <ArrowRight size={20} />
          <div>
            <small>Llega a</small>
            <strong>{movement.destino}</strong>
          </div>
        </div>
        {movement.observaciones ? (
          <div className="kardex-observation">
            <FileText size={17} />
            <div>
              <strong>Motivo registrado</strong>
              <p>{movement.observaciones}</p>
            </div>
          </div>
        ) : null}
        <div className="kardex-products-heading">
          <Warehouse size={18} />
          <div>
            <strong>Cambio de stock por producto</strong>
            <small>
              Saldo de este producto en ese almacén / lote / estado, antes y después del movimiento.
            </small>
          </div>
        </div>
        <div className="kardex-product-list">
          {movement.detalles.map((item, index) => {
            const entry = item.direccion === 'ENTRADA';
            return (
              <article className="kardex-product-card" key={`${item.producto}-${index}`}>
                <div className="kardex-product-head">
                  <div>
                    <strong>{item.producto}</strong>
                    <small>
                      {item.codigo || 'Sin código'} · {item.almacen} · {item.lote}
                    </small>
                    <Link
                      className="kardex-link"
                      href={`/movimientos?tab=producto&productoId=${item.productoId}&almacenId=${item.almacenId}`}
                      onClick={onClose}
                    >
                      Ver kardex de este producto
                    </Link>
                  </div>
                  <Badge tone={entry ? 'green' : 'blue'}>
                    {entry ? '+' : '−'}
                    {cantidad(item.cantidad)} · {directionLabel(item.direccion)}
                  </Badge>
                </div>
                <div className="kardex-balance-equation">
                  <div>
                    <small>Saldo anterior</small>
                    <strong>{cantidad(item.saldoAnterior)}</strong>
                  </div>
                  <span className={entry ? 'entry' : 'exit'}>
                    {entry ? '+' : '−'} {cantidad(item.cantidad)}
                  </span>
                  <div>
                    <small>Saldo posterior</small>
                    <strong>{cantidad(item.saldoPosterior)}</strong>
                  </div>
                </div>
                <div className="kardex-product-meta">
                  <span>
                    Estado: <strong>{item.estadoInventario}</strong>
                  </span>
                  <span>
                    Costo unitario: <strong>{moneda(item.costoUnitario)}</strong>
                  </span>
                  <span>
                    Valor movido: <strong>{moneda(item.costoTotal)}</strong>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
        <div className={modalActionsClass}>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
