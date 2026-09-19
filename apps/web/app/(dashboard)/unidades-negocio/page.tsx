'use client';

import { Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pagination } from '../../../components/Pagination';
import { UnidadNegocioFormModal } from '../../../components/UnidadNegocioFormModal';
import { getUnidades, UnidadNegocio, updateUnidad } from '../../../lib/unidades';

/**
 * Unidades de negocio: la operación principal y cada puesto satélite.
 *
 * Cada unidad lleva sus ventas, gastos, clientes y almacenes por separado; el administrador
 * las ve juntas eligiendo "Todo consolidado" en el selector de los reportes.
 */
export default function UnidadesNegocioPage() {
  const [unidades, setUnidades] = useState<UnidadNegocio[]>([]);
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<UnidadNegocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUnidades(await getUnidades());
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar las unidades de negocio',
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
    return unidades.filter((item) => {
      const matchesStatus =
        estado === 'Todos' || (estado === 'Activas' ? item.estado : !item.estado);
      const matchesSearch = !term || `${item.nombre} ${item.codigo}`.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [buscar, estado, unidades]);
  const pages = Math.max(1, Math.ceil(visibles.length / pageSize));
  const currentPage = Math.min(pagina, pages);
  const paginados = visibles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function abrir(item?: UnidadNegocio) {
    setEditando(item ?? null);
    setModal(true);
  }

  function handleSaved(saved: UnidadNegocio) {
    setUnidades((current) =>
      (current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved]
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
      setUnidades((current) => current.map((row) => (row.id === updated.id ? updated : row)));
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

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Unidades de negocio</h1>
          <span>{unidades.length} unidades</span>
        </div>
        <button
          type="button"
          className="round-add"
          onClick={() => abrir()}
          title="Agregar unidad de negocio"
          aria-label="Agregar unidad de negocio"
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
            placeholder="Buscar por nombre o código"
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
          <option>Activas</option>
          <option>Inactivas</option>
        </select>
      </div>
      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando unidades...
        </div>
      ) : (
        <>
          <div className="glass-table">
            <table>
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Contenido</th>
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
                        <small>
                          {item.codigo}
                          {item.principal ? ' · Principal' : ''}
                          {/* Cambia cómo se guardan sus ventas, así que tiene que verse de una
                              sola pasada por la lista. */}
                          {item.controlaInventario ? '' : ' · Solo ventas y gastos'}
                        </small>
                      </td>
                      <td>
                        {item.ventas} ventas · {item.gastos} gastos
                        <small>
                          {item.clientes} clientes
                          {/* Una unidad que lleva stock y no tiene almacén no puede vender:
                              conviene que salte a la vista. La que solo registra no lo usa. */}
                          {item.controlaInventario
                            ? ` · ${
                                item.almacenes
                                  ? `${item.almacenes} almacén${item.almacenes === 1 ? '' : 'es'}`
                                  : 'Sin almacén'
                              }`
                            : ' · Sin inventario'}
                        </small>
                      </td>
                      <td>
                        <span className={item.estado ? 'status status-green' : 'status status-red'}>
                          {item.estado ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-soft"
                            onClick={() => abrir(item)}
                            title="Editar unidad"
                            aria-label={`Editar ${item.nombre}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-soft"
                            onClick={() => void cambiarEstado(item)}
                            // La principal es la unidad por defecto de todo el sistema: sin
                            // ella no habría dónde caer, así que no se puede desactivar.
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
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      <div className="table-empty">
                        <Search size={22} />
                        <span>No hay unidades que coincidan con los filtros.</span>
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
        <UnidadNegocioFormModal
          editando={editando}
          onClose={() => setModal(false)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
