'use client';

import { Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pagination } from '../../../components/Pagination';
import { TrabajadorFormModal } from '../../../components/TrabajadorFormModal';
import { getTrabajadores, Trabajador, updateTrabajador } from '../../../lib/trabajadores';

export default function TrabajadoresPage() {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Trabajador | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTrabajadores(await getTrabajadores());
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar los trabajadores',
        { action: { label: 'Reintentar', onClick: () => void load() } },
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
  const pages = Math.max(1, Math.ceil(visibles.length / pageSize));
  const currentPage = Math.min(pagina, pages);
  const paginados = visibles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function abrir(item?: Trabajador) {
    setEditando(item ?? null);
    setModal(true);
  }

  function handleGuardado(saved: Trabajador) {
    setTrabajadores((current) =>
      (current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved]
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
      setTrabajadores((current) => current.map((row) => (row.id === updated.id ? updated : row)));
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

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Trabajadores</h1>
          <span>{trabajadores.length} trabajadores</span>
        </div>
        <button
          type="button"
          className="round-add"
          onClick={() => abrir()}
          title="Agregar trabajador"
          aria-label="Agregar trabajador"
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
            placeholder="Buscar por nombre, documento, cargo o usuario"
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
          <span className="loading-spinner" /> Cargando trabajadores...
        </div>
      ) : (
        <>
          <div className="glass-table">
            <table>
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th>Cargo</th>
                  <th>Contacto</th>
                  <th>Cuenta de acceso</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginados.length ? (
                  paginados.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>
                          {item.nombres} {item.apellidos}
                        </strong>
                        <small>
                          {item.tipoDocumento} {item.numeroDocumento}
                        </small>
                      </td>
                      <td>
                        {item.cargo}
                        {/* La unidad solo se nombra cuando no es la principal: en el caso
                            normal sería ruido en cada fila. */}
                        {item.unidad && item.unidad !== 'Principal' ? (
                          <small>{item.unidad}</small>
                        ) : null}
                      </td>
                      <td>
                        {item.telefono || 'Sin teléfono'}
                        <small>{item.correo || 'Sin correo'}</small>
                      </td>
                      <td>
                        {item.usuario ? (
                          <>
                            {item.usuario.username ?? item.usuario.email}
                            <small>{item.usuario.rolNombre}</small>
                          </>
                        ) : (
                          'Sin cuenta'
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
                            title="Editar trabajador"
                            aria-label={`Editar ${item.nombres}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-soft"
                            onClick={() => void cambiarEstado(item)}
                            disabled={processingId === item.id}
                            title={item.estado ? 'Desactivar trabajador' : 'Activar trabajador'}
                            aria-label={`${item.estado ? 'Desactivar' : 'Activar'} ${item.nombres}`}
                          >
                            {item.estado ? <UserX size={16} /> : <UserCheck size={16} />}
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
                        <span>No hay trabajadores que coincidan con los filtros.</span>
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
        <TrabajadorFormModal
          editando={editando}
          onClose={() => setModal(false)}
          onSaved={handleGuardado}
        />
      ) : null}
    </div>
  );
}
