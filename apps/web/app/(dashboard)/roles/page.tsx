'use client';

import { Building2, Pencil, Plus, Search, Trash2, UserCheck, UserX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pagination } from '../../../components/Pagination';
import { RolFormModal } from '../../../components/RolFormModal';
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
  const [roles, setRoles] = useState<Rol[]>([]);
  const [catalogo, setCatalogo] = useState<GrupoPermisos[]>([]);
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Rol | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, grupos] = await Promise.all([getRoles(), getCatalogoPermisos()]);
      setRoles(lista);
      setCatalogo(grupos);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : 'No se pudieron cargar los roles',
        { action: { label: 'Reintentar', onClick: () => void load() } },
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
  const pages = Math.max(1, Math.ceil(visibles.length / pageSize));
  const currentPage = Math.min(pagina, pages);
  const paginados = visibles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function abrir(item?: Rol) {
    setEditando(item ?? null);
    setModal(true);
  }

  function handleSaved(saved: Rol) {
    setRoles((current) =>
      (current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved]
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
      setRoles((current) => current.map((row) => (row.id === updated.id ? updated : row)));
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
      setRoles((current) => current.filter((row) => row.id !== item.id));
      toast.success(`Rol ${item.nombre} eliminado`);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : 'No se pudo eliminar el rol',
      );
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Roles y permisos</h1>
          <span>
            {roles.length} roles · {totalPermisos} permisos
          </span>
        </div>
        <button
          type="button"
          className="round-add"
          onClick={() => abrir()}
          title="Crear rol"
          aria-label="Crear rol"
          disabled={loading}
        >
          <Plus size={20} />
        </button>
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => {
              setBuscar(event.target.value);
              setPagina(1);
            }}
            placeholder="Buscar por nombre o descripción"
          />
        </label>
        <select
          className="filter-pill"
          value={estado}
          onChange={(event) => {
            setEstado(event.target.value);
            setPagina(1);
          }}
          aria-label="Filtrar por estado"
        >
          <option>Todos</option>
          <option>Activos</option>
          <option>Inactivos</option>
        </select>
      </div>
      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando roles...
        </div>
      ) : (
        <>
          <div className="glass-table rol-tabla">
            <table>
              <thead>
                <tr>
                  <th>Rol</th>
                  <th>Permisos</th>
                  <th>Personas</th>
                  <th>Unidades de negocio</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginados.length ? (
                  paginados.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.nombre}</strong>
                        <small>{item.descripcion || item.clave}</small>
                      </td>
                      <td>
                        {item.accesoTotal ? (
                          <span className="status status-blue">Acceso total</span>
                        ) : (
                          <>
                            {item.permisos.length} de {totalPermisos}
                            <small>
                              {item.permisos.length === 0
                                ? 'Sin permisos: no puede hacer nada'
                                : 'permisos marcados'}
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        {item.usuarios}
                        <small>
                          {item.usuarios === 0
                            ? 'Nadie lo usa'
                            : `${item.usuariosActivos} con acceso activo`}
                        </small>
                      </td>
                      <td>
                        {item.unidades.length ? (
                          <span className="rol-unidades">
                            {item.unidades.map((unidad) => (
                              <span className="rol-unidad" key={unidad.id}>
                                <Building2 size={12} aria-hidden="true" />
                                {unidad.nombre}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <small>Sin gente asignada</small>
                        )}
                      </td>
                      <td>
                        <span className={item.estado ? 'status status-green' : 'status status-red'}>
                          {item.estado ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-soft"
                            onClick={() => abrir(item)}
                            title="Editar rol"
                            aria-label={`Editar ${item.nombre}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-soft"
                            onClick={() => void cambiarEstado(item)}
                            disabled={processingId === item.id}
                            title={item.estado ? 'Desactivar rol' : 'Activar rol'}
                            aria-label={`${item.estado ? 'Desactivar' : 'Activar'} ${item.nombre}`}
                          >
                            {item.estado ? <UserX size={16} /> : <UserCheck size={16} />}
                          </button>
                          <button
                            type="button"
                            className="icon-soft"
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
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">
                        <Search size={22} />
                        <span>No hay roles que coincidan con los filtros.</span>
                        {buscar || estado !== 'Todos' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setBuscar('');
                              setEstado('Todos');
                            }}
                          >
                            Limpiar filtros
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={currentPage}
            pages={pages}
            total={visibles.length}
            pageSize={pageSize}
            onChange={setPagina}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPagina(1);
            }}
          />
        </>
      )}
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
