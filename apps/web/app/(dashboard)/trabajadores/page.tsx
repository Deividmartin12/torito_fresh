'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Search, UserCheck, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { TrabajadorFormModal } from '../../../components/TrabajadorFormModal';
import { AddButton } from '../../../components/ui/AddButton';
import { Badge } from '../../../components/ui/Badge';
import { IconButton } from '../../../components/ui/IconButton';
import { getTrabajadores, Trabajador, updateTrabajador } from '../../../lib/trabajadores';

export default function TrabajadoresPage() {
  const queryClient = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Trabajador | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const query = useQuery({ queryKey: ['trabajadores'], queryFn: () => getTrabajadores() });
  const trabajadores = query.data ?? [];
  const loading = query.isPending;
  const load = query.refetch;
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error
          ? query.error.message
          : 'No se pudieron cargar los trabajadores',
        { action: { label: 'Reintentar', onClick: () => void query.refetch() } },
      );
    }
  }, [query.error, query.refetch]);

  const visibles = useMemo(() => {
    const term = buscar.trim().toLowerCase();
    return trabajadores.filter((item) => {
      const matchesStatus =
        estado === 'Todos' || (estado === 'Activos' ? item.estado : !item.estado);
      const matchesSearch =
        !term ||
        `${item.nombres} ${item.apellidos} ${item.numeroDocumento} ${item.cargo} ${item.usuario?.username ?? ''}`
          .toLowerCase()
          .includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [buscar, estado, trabajadores]);
  function abrir(item?: Trabajador) {
    setEditando(item ?? null);
    setModal(true);
  }

  function handleGuardado(saved: Trabajador) {
    queryClient.setQueryData<Trabajador[]>(['trabajadores'], (current) =>
      (current?.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...(current ?? []), saved]
      ).sort((left, right) => left.nombres.localeCompare(right.nombres, 'es')),
    );
    setModal(false);
  }

  async function cambiarEstado(item: Trabajador) {
    // Desactivar a alguien también le cierra el acceso, así que conviene avisarlo.
    const aviso = item.usuario
      ? `¿Desactivar a ${item.nombres} ${item.apellidos}? Dejará de poder entrar al sistema.`
      : `¿Desactivar a ${item.nombres} ${item.apellidos}?`;
    if (item.estado && !window.confirm(aviso)) return;
    setProcessingId(item.id);
    try {
      const updated = await updateTrabajador(item.id, { estado: !item.estado });
      queryClient.setQueryData<Trabajador[]>(['trabajadores'], (current) =>
        current?.map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cambiar el estado del trabajador',
        { action: { label: 'Reintentar', onClick: () => void load() } },
      );
    } finally {
      setProcessingId(null);
    }
  }

  const columns: DataTableColumn<Trabajador>[] = [
    {
      key: 'trabajador',
      header: 'Trabajador',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">
            {item.nombres} {item.apellidos}
          </strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {item.tipoDocumento} {item.numeroDocumento}
          </small>
        </>
      ),
    },
    {
      key: 'cargo',
      header: 'Cargo',
      render: (item) => (
        <>
          {item.cargo}
          {/* La unidad solo se nombra cuando no es la principal: en el caso normal
              sería ruido en cada fila. */}
          {item.unidad && item.unidad !== 'Principal' ? (
            <small className="mt-0.5 block text-[11px] text-muted">{item.unidad}</small>
          ) : null}
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
            {item.correo || 'Sin correo'}
          </small>
        </>
      ),
    },
    {
      key: 'cuenta',
      header: 'Cuenta de acceso',
      render: (item) =>
        item.usuario ? (
          <>
            {item.usuario.username ?? item.usuario.email}
            <small className="mt-0.5 block text-[11px] text-muted">{item.usuario.rolNombre}</small>
          </>
        ) : (
          'Sin cuenta'
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
            title="Editar trabajador"
            aria-label={`Editar ${item.nombres}`}
          >
            <Pencil size={16} />
          </IconButton>
          <IconButton
            onClick={() => void cambiarEstado(item)}
            disabled={processingId === item.id}
            title={item.estado ? 'Desactivar trabajador' : 'Activar trabajador'}
            aria-label={`${item.estado ? 'Desactivar' : 'Activar'} ${item.nombres}`}
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
          <h1>Trabajadores</h1>
          <span>{trabajadores.length} trabajadores</span>
        </div>
        <AddButton label="Agregar trabajador" onClick={() => abrir()} disabled={loading} />
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar por nombre, documento, cargo o usuario"
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
        loadingLabel="Cargando trabajadores..."
        emptyMessage={
          <div className="flex flex-col items-center gap-2.5">
            <Search size={22} />
            <span>No hay trabajadores que coincidan con los filtros.</span>
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
        <TrabajadorFormModal
          editando={editando}
          onClose={() => setModal(false)}
          onSaved={handleGuardado}
        />
      ) : null}
    </div>
  );
}
