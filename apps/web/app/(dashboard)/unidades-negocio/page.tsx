'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Search, UserCheck, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { UnidadNegocioFormModal } from '../../../components/UnidadNegocioFormModal';
import { AddButton } from '../../../components/ui/AddButton';
import { Badge } from '../../../components/ui/Badge';
import { IconButton } from '../../../components/ui/IconButton';
import { getUnidades, UnidadNegocio, updateUnidad } from '../../../lib/unidades';

/**
 * Unidades de negocio: la operación principal y cada puesto satélite.
 *
 * Cada unidad lleva sus ventas, gastos, clientes y almacenes por separado; el administrador
 * las ve juntas eligiendo "Todo consolidado" en el selector de los reportes.
 */
export default function UnidadesNegocioPage() {
  const queryClient = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<UnidadNegocio | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const query = useQuery({ queryKey: ['unidades-negocio'], queryFn: getUnidades });
  const unidades = query.data ?? [];
  const loading = query.isPending;
  const load = query.refetch;
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error
          ? query.error.message
          : 'No se pudieron cargar las unidades de negocio',
        { action: { label: 'Reintentar', onClick: () => void query.refetch() } },
      );
    }
  }, [query.error, query.refetch]);

  const visibles = useMemo(() => {
    const term = buscar.trim().toLowerCase();
    return unidades.filter((item) => {
      const matchesStatus =
        estado === 'Todos' || (estado === 'Activas' ? item.estado : !item.estado);
      const matchesSearch = !term || `${item.nombre} ${item.codigo}`.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [buscar, estado, unidades]);

  function abrir(item?: UnidadNegocio) {
    setEditando(item ?? null);
    setModal(true);
  }

  function handleSaved(saved: UnidadNegocio) {
    queryClient.setQueryData<UnidadNegocio[]>(['unidades-negocio'], (current) =>
      (current?.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...(current ?? []), saved]
      ).sort(
        (left, right) =>
          Number(right.principal) - Number(left.principal) ||
          left.nombre.localeCompare(right.nombre, 'es'),
      ),
    );
    setModal(false);
  }

  async function cambiarEstado(item: UnidadNegocio) {
    if (
      item.estado &&
      !window.confirm(
        `¿Desactivar ${item.nombre}? Sus ventas y gastos se conservan, pero no podrá registrar nuevos.`,
      )
    )
      return;
    setProcessingId(item.id);
    try {
      const updated = await updateUnidad(item.id, { estado: !item.estado });
      queryClient.setQueryData<UnidadNegocio[]>(['unidades-negocio'], (current) =>
        current?.map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cambiar el estado de la unidad',
        { action: { label: 'Reintentar', onClick: () => void load() } },
      );
    } finally {
      setProcessingId(null);
    }
  }

  const columns: DataTableColumn<UnidadNegocio>[] = [
    {
      key: 'unidad',
      header: 'Unidad',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.nombre}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {item.codigo}
            {item.principal ? ' · Principal' : ''}
            {/* Cambia cómo se guardan sus ventas, así que tiene que verse de una
                sola pasada por la lista. */}
            {item.controlaInventario ? '' : ' · Solo ventas y gastos'}
          </small>
        </>
      ),
    },
    {
      key: 'contenido',
      header: 'Contenido',
      render: (item) => (
        <>
          {item.ventas} ventas · {item.gastos} gastos
          <small className="mt-0.5 block text-[11px] text-muted">
            {item.clientes} clientes
            {/* Una unidad que lleva stock y no tiene almacén no puede vender: conviene
                que salte a la vista. La que solo registra no lo usa. */}
            {item.controlaInventario
              ? ` · ${
                  item.almacenes
                    ? `${item.almacenes} almacén${item.almacenes === 1 ? '' : 'es'}`
                    : 'Sin almacén'
                }`
              : ' · Sin inventario'}
          </small>
        </>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => (
        <Badge tone={item.estado ? 'green' : 'red'}>{item.estado ? 'Activa' : 'Inactiva'}</Badge>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      cardLabel: null,
      render: (item) => (
        <div className="flex flex-wrap gap-[7px]">
          <IconButton
            onClick={() => abrir(item)}
            title="Editar unidad"
            aria-label={`Editar ${item.nombre}`}
          >
            <Pencil size={16} />
          </IconButton>
          <IconButton
            onClick={() => void cambiarEstado(item)}
            // La principal es la unidad por defecto de todo el sistema: sin ella no
            // habría dónde caer, así que no se puede desactivar.
            disabled={processingId === item.id || item.principal}
            title={
              item.principal
                ? 'La unidad principal no se puede desactivar'
                : item.estado
                  ? 'Desactivar unidad'
                  : 'Activar unidad'
            }
            aria-label={`${item.estado ? 'Desactivar' : 'Activar'} ${item.nombre}`}
          >
            {item.estado ? <UserX size={16} /> : <UserCheck size={16} />}
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Unidades de negocio</h1>
          <span>{unidades.length} unidades</span>
        </div>
        <AddButton label="Agregar unidad de negocio" onClick={() => abrir()} disabled={loading} />
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar por nombre o código"
          />
        </label>
        <select
          className="filter-pill"
          value={estado}
          onChange={(event) => setEstado(event.target.value)}
          aria-label="Filtrar por estado"
        >
          <option>Todos</option>
          <option>Activas</option>
          <option>Inactivas</option>
        </select>
      </div>
      <DataTable
        columns={columns}
        rows={visibles}
        rowKey={(item) => item.id}
        loading={loading}
        loadingLabel="Cargando unidades..."
        emptyMessage={
          <div className="flex flex-col items-center gap-2.5">
            <Search size={22} />
            <span>No hay unidades que coincidan con los filtros.</span>
            {buscar || estado !== 'Todos' ? (
              <button
                type="button"
                className="text-accent underline"
                onClick={() => {
                  setBuscar('');
                  setEstado('Todos');
                }}
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>
        }
      />
      {modal ? (
        <UnidadNegocioFormModal
          editando={editando}
          onClose={() => setModal(false)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
