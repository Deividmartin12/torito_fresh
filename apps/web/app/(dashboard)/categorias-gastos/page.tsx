'use client';

import { Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoriaGastoFormModal } from '../../../components/CategoriaGastoFormModal';
import {
  deleteExpenseCategory,
  ExpenseCategory,
  getExpenseCategories,
} from '../../../lib/expenses';

export default function ExpenseCategoriesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCategories(await getExpenseCategories());
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar las categorías', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () => categories.filter((item) => item.nombre.toLowerCase().includes(search.toLowerCase())),
    [categories, search],
  );
  function close() {
    setOpen(false);
    setEditing(null);
  }
  function openForm(category?: ExpenseCategory) {
    setEditing(category ?? null);
    setOpen(true);
  }
  function handleSaved(saved: ExpenseCategory) {
    setCategories((current) =>
      (current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved]
      ).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    );
    close();
  }
  async function remove(category: ExpenseCategory) {
    if (!window.confirm(`¿Eliminar la categoría ${category.nombre}?`)) return;
    try {
      await deleteExpenseCategory(category.id);
      setCategories((current) => current.filter((item) => item.id !== category.id));
      toast.success('Categoría eliminada.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo eliminar la categoría', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    }
  }

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Categorías de gasto</h1>
          <span>{categories.length} categorías registradas</span>
        </div>
        <button
          className="round-add"
          type="button"
          onClick={() => openForm()}
          title="Agregar categoría"
          aria-label="Agregar categoría"
        >
          <Plus size={20} />
        </button>
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar categoría"
          />
        </label>
      </div>
      {loading ? (
        <div className="table-loading">
          <span className="loading-spinner" /> Cargando categorías...
        </div>
      ) : (
        <div className="glass-table">
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.nombre}</strong>
                      {item.sistema ? <small>Categoría fija del sistema</small> : null}
                    </td>
                    <td>
                      {/* Las categorías del sistema son parte de la lógica de la app:
                          "Pago a trabajador" es la que enlaza el gasto con su beneficiario,
                          así que ni se renombra ni se elimina (el API también lo bloquea). */}
                      {item.sistema ? (
                        <span className="status status-green">
                          <Lock size={12} /> Protegida
                        </span>
                      ) : (
                        <div className="row-actions">
                          <button
                            className="icon-soft"
                            type="button"
                            onClick={() => openForm(item)}
                            title="Editar categoría"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-soft"
                            type="button"
                            onClick={() => void remove(item)}
                            title="Eliminar categoría"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>
                    <div className="table-empty">
                      No hay categorías que coincidan.
                      <button type="button" onClick={() => setSearch('')}>
                        Limpiar búsqueda
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {open ? (
        <CategoriaGastoFormModal editando={editing} onClose={close} onSaved={handleSaved} />
      ) : null}
    </div>
  );
}
