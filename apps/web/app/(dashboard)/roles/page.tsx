'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Search, Trash2, UserCheck, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { RolFormModal } from '../../../components/RolFormModal';
import { AddButton } from '../../../components/ui/AddButton';
import { Badge } from '../../../components/ui/Badge';
import { IconButton } from '../../../components/ui/IconButton';
import {
  deleteRol,
  getCatalogoPermisos,
  getRoles,
  GrupoPermisos,
  Rol,
  updateRol,
} from '../../../lib/roles';

/**
 * Roles y permisos: quién puede hacer qué en la app.
 *
 * Hasta acá los roles eran cinco valores fijos en el código, así que sumar un puesto nuevo
 * —un supervisor, un cajero— obligaba a tocar el API y volver a desplegar. Ahora son filas:
 * se crean desde esta pantalla, se les marcan los permisos y andan al instante, sin que nadie
 * tenga que cerrar sesión.
 *
 * La columna de unidades de negocio no significa que el rol pertenezca a una: el rol es del
 * sistema entero. Lo que muestra es dónde está trabajando la gente que lo tiene, que es lo
 * que hace falta saber antes de tocarle los permisos.
 */
export default function RolesPage() {
  const queryClient = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Rol | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: getRoles });
  const roles = rolesQuery.data ?? [];
  const catalogoQuery = useQuery({ queryKey: ['permisos-catalogo'], queryFn: getCatalogoPermisos });
  const catalogo = catalogoQuery.data ?? [];
  const loading = rolesQuery.isPending || catalogoQuery.isPending;
  const load = async () => {
    await Promise.all([rolesQuery.refetch(), catalogoQuery.refetch()]);
  };
  useEffect(() => {
    const fallo = rolesQuery.error ?? catalogoQuery.error;
    if (fallo) {
      toast.error(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los roles', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesQuery.error, catalogoQuery.error]);

  // Cuántos permisos existen en total, para poder decir "12 de 45" y que el número signifique
  // algo sin tener que abrir el rol.
  const totalPermisos = useMemo(
    () => catalogo.reduce((suma, grupo) => suma + grupo.permisos.length, 0),
    [catalogo],
  );

  const visibles = useMemo(() => {
    const term = buscar.trim().toLowerCase();
    return roles.filter((item) => {
      const matchesStatus =
        estado === 'Todos' || (estado === 'Activos' ? item.estado : !item.estado);
      const matchesSearch =
        !term ||
        `${item.nombre} ${item.clave} ${item.descripcion ?? ''}`.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [buscar, estado, roles]);
  function abrir(item?: Rol) {
    setEditando(item ?? null);
    setModal(true);
  }

  function handleSaved(saved: Rol) {
    queryClient.setQueryData<Rol[]>(['roles'], (current) =>
      (current?.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...(current ?? []), saved]
      ).sort(
        (left, right) =>
          Number(right.sistema) - Number(left.sistema) ||
          left.nombre.localeCompare(right.nombre, 'es'),
      ),
    );
    setModal(false);
  }

  async function cambiarEstado(item: Rol) {
    const aviso = item.usuariosActivos
      ? `¿Desactivar el rol ${item.nombre}? Las ${item.usuariosActivos} persona(s) que lo tienen no van a poder entrar hasta que se les asigne otro.`
      : `¿Desactivar el rol ${item.nombre}?`;
    if (item.estado && !window.confirm(aviso)) return;
    setProcessingId(item.id);
    try {
      const updated = await updateRol(item.id, { estado: !item.estado });
      queryClient.setQueryData<Rol[]>(['roles'], (current) =>
        current?.map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cambiar el estado del rol',
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function eliminar(item: Rol) {
    if (!window.confirm(`¿Eliminar el rol ${item.nombre}? Esta acción no se puede deshacer.`))
      return;
    setProcessingId(item.id);
    try {
      await deleteRol(item.id);
      queryClient.setQueryData<Rol[]>(['roles'], (current) =>
        current?.filter((row) => row.id !== item.id),
      );
      toast.success(`Rol ${item.nombre} eliminado`);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : 'No se pudo eliminar el rol',
      );
    } finally {
      setProcessingId(null);
    }
  }

  const columns: DataTableColumn<Rol>[] = [
    {
      key: 'rol',
      header: 'Rol',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.nombre}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {item.descripcion || item.clave}
          </small>
        </>
      ),
    },
    {
      key: 'permisos',
      header: 'Permisos',
      render: (item) =>
        item.accesoTotal ? (
          <Badge tone="blue">Acceso total</Badge>
        ) : (
          <>
            {item.permisos.length} de {totalPermisos}
            <small className="mt-0.5 block text-[11px] text-muted">
              {item.permisos.length === 0
                ? 'Sin permisos: no puede hacer nada'
                : 'permisos marcados'}
            </small>
          </>
        ),
    },
    {
      key: 'personas',
      header: 'Personas',
      render: (item) => (
        <>
          {item.usuarios}
          <small className="mt-0.5 block text-[11px] text-muted">
            {item.usuarios === 0 ? 'Nadie lo usa' : `${item.usuariosActivos} con acceso activo`}
          </small>
        </>
      ),
    },
    {
      key: 'unidades',
      header: 'Unidades de negocio',
      render: (item) =>
        item.unidades.length ? (
          <span className="rol-unidades">
            {item.unidades.map((unidad) => (
              <span className="rol-unidad" key={unidad.id}>
                <Building2 size={12} aria-hidden="true" />
                {unidad.nombre}
              </span>
            ))}
          </span>
        ) : (
          <small className="text-[11px] text-muted">Sin gente asignada</small>
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
            title="Editar rol"
            aria-label={`Editar ${item.nombre}`}
          >
            <Pencil size={16} />
          </IconButton>
          <IconButton
            onClick={() => void cambiarEstado(item)}
            disabled={processingId === item.id}
            title={item.estado ? 'Desactivar rol' : 'Activar rol'}
            aria-label={`${item.estado ? 'Desactivar' : 'Activar'} ${item.nombre}`}
          >
            {item.estado ? <UserX size={16} /> : <UserCheck size={16} />}
          </IconButton>
          <IconButton
            onClick={() => void eliminar(item)}
            // Los roles del sistema y los que tienen gente adentro no se
            // borran: el API lo rechaza igual, y el botón apagado con su
            // motivo evita el viaje y el mensaje de error.
            disabled={processingId === item.id || item.sistema || item.usuarios > 0}
            title={
              item.sistema
                ? 'Es un rol del sistema: se puede desactivar, no eliminar'
                : item.usuarios > 0
                  ? 'Hay gente con este rol: cámbiales el rol primero'
                  : 'Eliminar rol'
            }
            aria-label={`Eliminar ${item.nombre}`}
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Roles y permisos</h1>
          <span>
            {roles.length} roles · {totalPermisos} permisos
          </span>
        </div>
        <AddButton label="Crear rol" onClick={() => abrir()} disabled={loading} />
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar por nombre o descripción"
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
        loadingLabel="Cargando roles..."
        emptyMessage={
          <div className="flex flex-col items-center gap-2.5">
            <Search size={22} />
            <span>No hay roles que coincidan con los filtros.</span>
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
        <RolFormModal
          catalogo={catalogo}
          editando={editando}
          onClose={() => setModal(false)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
