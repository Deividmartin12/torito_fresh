'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import {
  TipoProductoCreado,
  TipoProductoFormModal,
} from '../../../components/TipoProductoFormModal';
import { AddButton } from '../../../components/ui/AddButton';
import { IconButton } from '../../../components/ui/IconButton';
import { api } from '../../../lib/api';
import { normalizarBusqueda } from '../../../lib/format';
import { puede } from '../../../lib/permissions';
import { usePermisos } from '../../../lib/useCurrentUser';

export default function TiposProductoPage() {
  const queryClient = useQueryClient();
  const editable = puede(usePermisos(), 'productos.editar');
  const [buscar, setBuscar] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<TipoProductoCreado | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['product-types'],
    queryFn: () => api<TipoProductoCreado[]>('/operations/product-types'),
  });
  const tipos = query.data ?? [];
  useEffect(() => {
    if (query.error)
      toast.error(
        query.error instanceof Error
          ? query.error.message
          : 'No se pudieron cargar los tipos de producto',
        {
          action: { label: 'Reintentar', onClick: () => void query.refetch() },
        },
      );
  }, [query.error, query.refetch]);

  function abrir(tipo?: TipoProductoCreado) {
    setEditando(tipo ?? null);
    setModal(true);
  }

  function guardado(saved: TipoProductoCreado) {
    queryClient.setQueryData<TipoProductoCreado[]>(['product-types'], (current) =>
      [...(current ?? []).filter((item) => item.id !== saved.id), saved].sort((a, b) =>
        a.nombre.localeCompare(b.nombre),
      ),
    );
    void queryClient.invalidateQueries({ queryKey: ['product-types'] });
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    setModal(false);
  }

  async function eliminar(tipo: TipoProductoCreado) {
    if (
      eliminando ||
      !window.confirm(
        `¿Eliminar el tipo de producto ${tipo.nombre}? Esta acción no se puede deshacer.`,
      )
    )
      return;
    setEliminando(tipo.id);
    try {
      await api(`/operations/product-types/${tipo.id}`, { method: 'DELETE' });
      queryClient.setQueryData<TipoProductoCreado[]>(['product-types'], (current) =>
        current?.filter((item) => item.id !== tipo.id),
      );
      void queryClient.invalidateQueries({ queryKey: ['product-types'] });
      toast.success('Tipo de producto eliminado.');
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : 'No se pudo eliminar el tipo de producto',
      );
    } finally {
      setEliminando(null);
    }
  }

  const columns: DataTableColumn<TipoProductoCreado>[] = [
    {
      key: 'nombre',
      header: 'Tipo de producto',
      render: (item) => <strong className="text-[13px] font-medium text-fg">{item.nombre}</strong>,
    },
    {
      key: 'acciones',
      header: 'Acciones',
      cardLabel: null,
      render: (item) =>
        editable ? (
          <div className="flex flex-wrap gap-[7px]">
            <IconButton
              title="Editar tipo de producto"
              aria-label={`Editar ${item.nombre}`}
              onClick={() => abrir(item)}
              disabled={eliminando !== null}
            >
              <Pencil size={16} />
            </IconButton>
            <IconButton
              title="Eliminar tipo de producto"
              aria-label={`Eliminar ${item.nombre}`}
              onClick={() => void eliminar(item)}
              disabled={eliminando !== null}
            >
              <Trash2 size={16} />
            </IconButton>
          </div>
        ) : (
          <span className="text-xs text-muted">Solo lectura</span>
        ),
    },
  ];

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Tipos de producto</h1>
          <span>{tipos.length} tipos registrados</span>
        </div>
        {editable ? <AddButton label="Agregar tipo de producto" onClick={() => abrir()} /> : null}
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar tipo de producto"
          />
        </label>
      </div>
      <DataTable
        columns={columns}
        rows={tipos.filter((item) =>
          normalizarBusqueda(item.nombre).includes(normalizarBusqueda(buscar)),
        )}
        rowKey={(item) => item.id}
        loading={query.isPending}
        loadingLabel="Cargando tipos de producto..."
        emptyMessage="No hay tipos de producto que coincidan."
      />
      {modal ? (
        <TipoProductoFormModal
          editando={editando}
          onClose={() => setModal(false)}
          onSaved={guardado}
        />
      ) : null}
    </div>
  );
}
