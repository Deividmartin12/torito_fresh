'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Search, UserCheck, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { ProveedorFormModal } from '../../../components/ProveedorFormModal';
import { AddButton } from '../../../components/ui/AddButton';
import { Badge } from '../../../components/ui/Badge';
import { IconButton } from '../../../components/ui/IconButton';
import { getProveedores, Proveedor, updateProveedor } from '../../../lib/proveedores';

export default function ProveedoresPage() {
  const queryClient = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const query = useQuery({ queryKey: ['proveedores'], queryFn: getProveedores });
  const proveedores = query.data ?? [];
  const loading = query.isPending;
  const load = query.refetch;
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error
          ? query.error.message
          : 'No se pudieron cargar los proveedores',
        { action: { label: 'Reintentar', onClick: () => void query.refetch() } },
      );
    }
  }, [query.error, query.refetch]);

  const visibles = useMemo(() => {
    const term = buscar.trim().toLowerCase();
    return proveedores.filter((item) => {
      const matchesStatus =
        estado === 'Todos' || (estado === 'Activos' ? item.estado : !item.estado);
      const matchesSearch =
        !term ||
        `${item.razonSocial} ${item.ruc} ${item.nombreComercial} ${item.telefono}`
          .toLowerCase()
          .includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [buscar, estado, proveedores]);

  function abrir(item?: Proveedor) {
    setEditando(item ?? null);
    setModal(true);
  }

  function handleSaved(saved: Proveedor) {
    queryClient.setQueryData<Proveedor[]>(['proveedores'], (current) =>
      (current?.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...(current ?? []), saved]
      ).sort((left, right) => left.razonSocial.localeCompare(right.razonSocial, 'es')),
    );
    setModal(false);
  }

  async function cambiarEstado(item: Proveedor) {
    if (item.estado && !window.confirm(`¿Desactivar a ${item.razonSocial}?`)) return;
    setProcessingId(item.id);
    try {
      const updated = await updateProveedor(item.id, { estado: !item.estado });
      queryClient.setQueryData<Proveedor[]>(['proveedores'], (current) =>
        current?.map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cambiar el estado del proveedor',
        { action: { label: 'Reintentar', onClick: () => void load() } },
      );
    } finally {
      setProcessingId(null);
    }
  }

  const columns: DataTableColumn<Proveedor>[] = [
    {
      key: 'proveedor',
      header: 'Proveedor',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.razonSocial}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {item.ruc}
            {item.nombreComercial ? ` · ${item.nombreComercial}` : ''}
          </small>
        </>
      ),
    },
    {
      key: 'contacto',
      header: 'Contacto',
      render: (item) => (
        <>
          {item.telefono || 'Sin teléfono'}
          <small className="mt-0.5 block text-[11px] text-muted">
            {item.correo || item.direccion || 'Sin datos adicionales'}
          </small>
        </>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => (
        <Badge tone={item.estado ? 'green' : 'red'}>{item.estado ? 'Activo' : 'Inactivo'}</Badge>
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
            title="Editar proveedor"
            aria-label={`Editar ${item.razonSocial}`}
          >
            <Pencil size={16} />
          </IconButton>
          <IconButton
            onClick={() => void cambiarEstado(item)}
            disabled={processingId === item.id}
            title={item.estado ? 'Desactivar proveedor' : 'Activar proveedor'}
            aria-label={`${item.estado ? 'Desactivar' : 'Activar'} ${item.razonSocial}`}
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
          <h1>Proveedores</h1>
          <span>{proveedores.length} proveedores</span>
        </div>
        <AddButton label="Agregar proveedor" onClick={() => abrir()} disabled={loading} />
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar por razon social, RUC o nombre comercial"
          />
        </label>
        <select
          className="filter-pill"
          value={estado}
          onChange={(event) => setEstado(event.target.value)}
          aria-label="Filtrar por estado"
        >
          <option>Todos</option>
          <option>Activos</option>
          <option>Inactivos</option>
        </select>
      </div>
      <DataTable
        columns={columns}
        rows={visibles}
        rowKey={(item) => item.id}
        loading={loading}
        loadingLabel="Cargando proveedores..."
        emptyMessage={
          <div className="flex flex-col items-center gap-2.5">
            <Search size={22} />
            <span>No hay proveedores que coincidan con los filtros.</span>
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
        <ProveedorFormModal
          editando={editando}
          onClose={() => setModal(false)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
