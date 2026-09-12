'use client';

import { Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pagination } from '../../../components/Pagination';
import { ProveedorFormModal } from '../../../components/ProveedorFormModal';
import { getProveedores, Proveedor, updateProveedor } from '../../../lib/proveedores';

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProveedores(await getProveedores());
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar los proveedores',
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
  const pages = Math.max(1, Math.ceil(visibles.length / pageSize));
  const currentPage = Math.min(pagina, pages);
  const paginados = visibles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function abrir(item?: Proveedor) {
    setEditando(item ?? null);
    setModal(true);
  }

  function handleSaved(saved: Proveedor) {
    setProveedores((current) =>
      (current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved]
      ).sort((left, right) => left.razonSocial.localeCompare(right.razonSocial, 'es')),
    );
    setModal(false);
  }

  async function cambiarEstado(item: Proveedor) {
    if (item.estado && !window.confirm(`¿Desactivar a ${item.razonSocial}?`)) return;
    setProcessingId(item.id);
    try {
      const updated = await updateProveedor(item.id, { estado: !item.estado });
      setProveedores((current) => current.map((row) => (row.id === updated.id ? updated : row)));
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

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Proveedores</h1>
          <span>{proveedores.length} proveedores</span>
        </div>
        <button
          type="button"
          className="round-add"
          onClick={() => abrir()}
          title="Agregar proveedor"
          aria-label="Agregar proveedor"
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
            placeholder="Buscar por razon social, RUC o nombre comercial"
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
          <span className="loading-spinner" /> Cargando proveedores...
        </div>
      ) : (
        <>
          <div className="glass-table">
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginados.length ? (
                  paginados.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.razonSocial}</strong>
                        <small>
                          {item.ruc}
                          {item.nombreComercial ? ` · ${item.nombreComercial}` : ''}
                        </small>
                      </td>
                      <td>
                        {item.telefono || 'Sin teléfono'}
                        <small>{item.correo || item.direccion || 'Sin datos adicionales'}</small>
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
                            title="Editar proveedor"
                            aria-label={`Editar ${item.razonSocial}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-soft"
                            onClick={() => void cambiarEstado(item)}
                            disabled={processingId === item.id}
                            title={item.estado ? 'Desactivar proveedor' : 'Activar proveedor'}
                            aria-label={`${item.estado ? 'Desactivar' : 'Activar'} ${item.razonSocial}`}
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
                        <span>No hay proveedores que coincidan con los filtros.</span>
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
        <ProveedorFormModal
          editando={editando}
          onClose={() => setModal(false)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
