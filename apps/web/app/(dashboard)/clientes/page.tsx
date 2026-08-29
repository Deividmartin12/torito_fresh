'use client';

import { Pencil, Plus, Search, UserX } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ClienteFormModal } from '../../../components/ClienteFormModal';
import { Pagination } from '../../../components/Pagination';
import { api } from '../../../lib/api';
import { Cliente } from '../../../lib/clients';
import { money } from '../../../lib/format';
import { puedeEditar } from '../../../lib/permissions';
import { useRole } from '../../../lib/useCurrentUser';

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const editable = puedeEditar(useRole());
  const load = useCallback(async () => {
    try {
      setClientes(await api<Cliente[]>('/clients'));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar los clientes', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visibles = useMemo(
    () =>
      clientes.filter((cliente) =>
        `${cliente.name} ${cliente.document ?? ''} ${cliente.phone}`
          .toLowerCase()
          .includes(buscar.toLowerCase()),
      ),
    [buscar, clientes],
  );
  const paginados = visibles.slice((pagina - 1) * pageSize, pagina * pageSize);
  function abrir(cliente?: Cliente) {
    setEditando(cliente ?? null);
    setModal(true);
  }
  function cerrar() {
    setModal(false);
    setEditando(null);
  }
  function onSaved(saved: Cliente) {
    setClientes((current) =>
      editando ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current],
    );
    cerrar();
  }
  async function desactivar(id: string) {
    try {
      const updated = await api<Cliente>(`/clients/${id}/deactivate`, { method: 'PATCH' });
      setClientes((current) => current.map((item) => (item.id === id ? updated : item)));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo desactivar el cliente', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    }
  }

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Clientes</h1>
          <span>{clientes.length} clientes</span>
        </div>
        <button
          className="round-add"
          onClick={() => abrir()}
          title="Agregar cliente"
          aria-label="Agregar cliente"
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
            placeholder="Buscar por nombre, documento o teléfono"
          />
        </label>
      </div>
      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando clientes...
        </div>
      ) : (
        <>
          <div className="glass-table">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contacto</th>
                  <th>Deuda</th>
                  <th>Envases</th>
                  <th>Estado</th>
                  {editable ? <th>Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {paginados.length ? (
                  paginados.map((cliente) => (
                    <tr key={cliente.id}>
                      <td>
                        <strong>{cliente.name}</strong>
                        <small>
                          {cliente.document
                            ? `${cliente.documentType || 'DOC'} · ${cliente.document}`
                            : 'Sin documento'}
                        </small>
                      </td>
                      <td>
                        {cliente.phone}
                        <small>{cliente.address}</small>
                      </td>
                      <td>
                        {cliente.debtBalance > 0 ? (
                          <Link
                            className="client-debt-link"
                            href={`/cobranzas?cliente=${cliente.id}`}
                          >
                            <strong>{money(cliente.debtBalance)}</strong>
                            {cliente.overdueCount > 0 ? (
                              <small className="client-debt-overdue">
                                {cliente.overdueCount} vencidas · {money(cliente.overdueBalance)}
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
                        )}
                      </td>
                      <td>{cliente.containerBalance ?? 0}</td>
                      <td>
                        <span
                          className={cliente.active ? 'status status-green' : 'status status-red'}
                        >
                          {cliente.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      {editable ? (
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-soft"
                              onClick={() => abrir(cliente)}
                              title="Editar cliente"
                              aria-label={`Editar ${cliente.name}`}
                            >
                              <Pencil size={16} />
                            </button>
                            {cliente.active ? (
                              <button
                                className="icon-soft"
                                onClick={() => void desactivar(cliente.id)}
                                title="Desactivar cliente"
                                aria-label={`Desactivar ${cliente.name}`}
                              >
                                <UserX size={16} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={editable ? 6 : 5}>
                      <div className="table-empty">
                        No hay clientes que coincidan con la búsqueda.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pagina}
            pages={Math.max(1, Math.ceil(visibles.length / pageSize))}
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
        <ClienteFormModal editando={editando} onClose={cerrar} onSaved={onSaved} />
      ) : null}
    </div>
  );
}
