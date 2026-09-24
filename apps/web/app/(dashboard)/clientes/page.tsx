'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Search, UserCheck, UserX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { ClienteFormModal } from '../../../components/ClienteFormModal';
import { AddButton } from '../../../components/ui/AddButton';
import { Badge } from '../../../components/ui/Badge';
import { IconButton } from '../../../components/ui/IconButton';
import { api } from '../../../lib/api';
import { Cliente } from '../../../lib/clients';
import { moneda } from '../../../lib/format';
import { puede } from '../../../lib/permissions';
import { usePermisos } from '../../../lib/useCurrentUser';

export default function ClientesPage() {
  const queryClient = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const editable = puede(usePermisos(), 'clientes.editar');
  const query = useQuery({ queryKey: ['clients'], queryFn: () => api<Cliente[]>('/clients') });
  const clientes = query.data ?? [];
  const loading = query.isPending;
  const load = query.refetch;
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error ? query.error.message : 'No se pudieron cargar los clientes',
        { action: { label: 'Reintentar', onClick: () => void query.refetch() } },
      );
    }
  }, [query.error, query.refetch]);
  const visibles = useMemo(
    () =>
      clientes.filter((cliente) =>
        `${cliente.name} ${cliente.document ?? ''} ${cliente.phone}`
          .toLowerCase()
          .includes(buscar.toLowerCase()),
      ),
    [buscar, clientes],
  );
  function abrir(cliente?: Cliente) {
    setEditando(cliente ?? null);
    setModal(true);
  }
  function cerrar() {
    setModal(false);
    setEditando(null);
  }
  function onSaved(saved: Cliente) {
    queryClient.setQueryData<Cliente[]>(['clients'], (current) =>
      editando
        ? current?.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...(current ?? [])],
    );
    cerrar();
  }
  async function cambiarEstado(cliente: Cliente) {
    const accion = cliente.active ? 'deactivate' : 'activate';
    try {
      const updated = await api<Cliente>(`/clients/${cliente.id}/${accion}`, { method: 'PATCH' });
      queryClient.setQueryData<Cliente[]>(['clients'], (current) =>
        current?.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : 'No se pudo cambiar el estado del cliente',
        {
          action: { label: 'Reintentar', onClick: () => void load() },
        },
      );
    }
  }

  const columns: DataTableColumn<Cliente>[] = [
    {
      key: 'cliente',
      header: 'Cliente',
      cardLabel: null,
      render: (cliente) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{cliente.name}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {cliente.document
              ? `${cliente.documentType || 'DOC'} · ${cliente.document}`
              : 'Sin documento'}
          </small>
        </>
      ),
    },
    {
      key: 'contacto',
      header: 'Contacto',
      render: (cliente) => (
        <>
          {cliente.phone}
          <small className="mt-0.5 block text-[11px] text-muted">{cliente.address}</small>
        </>
      ),
    },
    {
      key: 'deuda',
      header: 'Deuda',
      render: (cliente) =>
        cliente.debtBalance > 0 ? (
          <Link className="client-debt-link" href={`/cobranzas?cliente=${cliente.id}`}>
            <strong>{moneda(cliente.debtBalance)}</strong>
            {cliente.overdueCount > 0 ? (
              <small className="client-debt-overdue">
                {cliente.overdueCount} vencidas · {moneda(cliente.overdueBalance)}
              </small>
            ) : (
              <small>
                {cliente.pendingReceivables}{' '}
                {cliente.pendingReceivables === 1 ? 'comprobante' : 'comprobantes'}
              </small>
            )}
          </Link>
        ) : (
          <span className="client-debt-clear">Sin deuda</span>
        ),
    },
    {
      key: 'envases',
      header: 'Envases',
      render: (cliente) => cliente.containerBalance ?? 0,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (cliente) => (
        <Badge tone={cliente.active ? 'green' : 'red'}>
          {cliente.active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    ...(editable
      ? [
          {
            key: 'acciones',
            header: 'Acciones',
            cardLabel: null,
            render: (cliente: Cliente) => (
              <div className="flex flex-wrap gap-[7px]">
                <IconButton
                  onClick={() => abrir(cliente)}
                  title="Editar cliente"
                  aria-label={`Editar ${cliente.name}`}
                >
                  <Pencil size={16} />
                </IconButton>
                <IconButton
                  onClick={() => void cambiarEstado(cliente)}
                  title={cliente.active ? 'Desactivar cliente' : 'Activar cliente'}
                  aria-label={`${cliente.active ? 'Desactivar' : 'Activar'} ${cliente.name}`}
                >
                  {cliente.active ? <UserX size={16} /> : <UserCheck size={16} />}
                </IconButton>
              </div>
            ),
          } satisfies DataTableColumn<Cliente>,
        ]
      : []),
  ];

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Clientes</h1>
          <span>{clientes.length} clientes</span>
        </div>
        <AddButton label="Agregar cliente" onClick={() => abrir()} />
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar por nombre, documento o teléfono"
          />
        </label>
      </div>
      <DataTable
        columns={columns}
        rows={visibles}
        rowKey={(cliente) => cliente.id}
        loading={loading}
        loadingLabel="Cargando clientes..."
        emptyMessage={<span>No hay clientes que coincidan con la búsqueda.</span>}
      />
      {modal ? <ClienteFormModal editando={editando} onClose={cerrar} onSaved={onSaved} /> : null}
    </div>
  );
}
