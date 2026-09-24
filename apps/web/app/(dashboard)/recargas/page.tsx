'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { Badge, BadgeTone } from '../../../components/ui/Badge';
import { fechaCorta, moneda } from '../../../lib/format';
import { EstadoRecarga, RecargaCliente, getRecargas } from '../../../lib/recargas';

const ESTADO_INFO: Record<EstadoRecarga, { label: string; tone: BadgeTone }> = {
  ATRASADO: { label: 'Atrasado', tone: 'red' },
  POR_VENCER: { label: 'Por vencer', tone: 'amber' },
  AL_DIA: { label: 'Al día', tone: 'green' },
  SIN_HISTORIAL: { label: 'Sin historial', tone: 'gray' },
};

export default function RecargasPage() {
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<'Todos' | EstadoRecarga>('Todos');

  const query = useQuery({ queryKey: ['recargas'], queryFn: getRecargas });
  const recargas = query.data ?? [];
  const loading = query.isPending;
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error ? query.error.message : 'No se pudieron cargar las recargas',
        { action: { label: 'Reintentar', onClick: () => void query.refetch() } },
      );
    }
  }, [query.error, query.refetch]);

  // El servidor ya ordena por urgencia; aquí solo se refina por estado y por nombre.
  const visibles = useMemo(
    () =>
      recargas.filter(
        (item) =>
          (estado === 'Todos' || item.estado === estado) &&
          item.cliente.toLowerCase().includes(search.toLowerCase()),
      ),
    [recargas, estado, search],
  );

  const conIntervalo = recargas.filter((item) => item.intervaloDias !== null);
  const intervaloPromedio = conIntervalo.length
    ? Math.round(
        conIntervalo.reduce((suma, item) => suma + (item.intervaloDias ?? 0), 0) /
          conIntervalo.length,
      )
    : 0;
  const porRecargarPronto = recargas.filter(
    (item) => item.estado === 'ATRASADO' || item.estado === 'POR_VENCER',
  ).length;

  const columns: DataTableColumn<RecargaCliente>[] = [
    {
      key: 'cliente',
      header: 'Cliente',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.cliente}</strong>
          {item.telefono ? (
            <small className="mt-0.5 block text-[11px] text-muted">{item.telefono}</small>
          ) : null}
        </>
      ),
    },
    { key: 'recargas', header: 'Recargas', render: (item) => item.compras },
    {
      key: 'ultima',
      header: 'Última recarga',
      render: (item) => (
        <>
          {fechaCorta(item.ultimaRecarga)}
          <small className="mt-0.5 block text-[11px] text-muted">
            Hace {item.diasDesdeUltima} días
          </small>
        </>
      ),
    },
    {
      key: 'intervalo',
      header: 'Cada cuánto',
      render: (item) => (item.intervaloDias !== null ? `${item.intervaloDias} días` : '—'),
    },
    {
      key: 'proxima',
      header: 'Próxima recarga',
      render: (item) => fechaCorta(item.proximaRecarga),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => (
        <Badge tone={ESTADO_INFO[item.estado].tone}>{ESTADO_INFO[item.estado].label}</Badge>
      ),
    },
    { key: 'ultimoPago', header: 'Último pago', render: (item) => moneda(item.ultimoPago) },
  ];

  return (
    <div className="module-page operations-list-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Ventas</span>
          <h1>Frecuencia de recarga</h1>
        </div>
      </div>
      <div className="summary-row">
        <div className="summary-glass">
          <span>Intervalo promedio</span>
          <strong>{intervaloPromedio} días</strong>
          <small>Entre una recarga y la siguiente</small>
        </div>
        <div className="summary-glass">
          <span>Por recargar pronto</span>
          <strong>{porRecargarPronto}</strong>
          <small>Atrasados o por vencer</small>
        </div>
        <div className="summary-glass">
          <span>Clientes con historial</span>
          <strong>{conIntervalo.length}</strong>
          <small>Con 2 o más recargas</small>
        </div>
      </div>
      <div className="module-tools operations-filters">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente"
          />
        </label>
        <label className="filter-field">
          <span>Estado</span>
          <select
            className="filter-pill"
            value={estado}
            onChange={(event) => setEstado(event.target.value as 'Todos' | EstadoRecarga)}
          >
            <option value="Todos">Todos</option>
            <option value="ATRASADO">Atrasado</option>
            <option value="POR_VENCER">Por vencer</option>
            <option value="AL_DIA">Al día</option>
            <option value="SIN_HISTORIAL">Sin historial</option>
          </select>
        </label>
      </div>
      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando recargas...
        </div>
      ) : recargas.length === 0 ? (
        <div className="empty-state">
          <CalendarClock size={34} />
          <h2>Aún no hay recargas</h2>
          <p>Cuando registres ventas confirmadas, aquí verás cada cuánto compra cada cliente.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={visibles}
          rowKey={(item) => item.clienteId}
          emptyMessage={
            <div className="flex flex-col items-center gap-2.5">
              <Search size={22} />
              <span>No hay clientes que coincidan con los filtros.</span>
              <button
                type="button"
                className="text-accent underline"
                onClick={() => {
                  setSearch('');
                  setEstado('Todos');
                }}
              >
                Limpiar filtros
              </button>
            </div>
          }
        />
      )}
    </div>
  );
}
