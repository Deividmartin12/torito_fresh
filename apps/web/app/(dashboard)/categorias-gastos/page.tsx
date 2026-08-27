'use client';

import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createExpenseCategory,
  deleteExpenseCategory,
  ExpenseCategory,
  getExpenseCategories,
  updateExpenseCategory,
} from '../../../lib/expenses';

export default function ExpenseCategoriesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCategories(await getExpenseCategories());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las categorías');
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
    setName('');
  }
  function openForm(category?: ExpenseCategory) {
    setError('');
    setEditing(category ?? null);
    setName(category?.nombre ?? '');
    setOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = editing
        ? await updateExpenseCategory(editing.id, name)
        : await createExpenseCategory(name);
      setCategories((current) =>
        (editing
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved]
        ).sort((a, b) => a.nombre.localeCompare(b.nombre)),
      );
      setMessage(editing ? 'Categoría actualizada.' : 'Categoría registrada.');
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la categoría');
    } finally {
      setSaving(false);
    }
  }
  async function remove(category: ExpenseCategory) {
    if (!window.confirm(`¿Eliminar la categoría ${category.nombre}?`)) return;
    setError('');
    try {
      await deleteExpenseCategory(category.id);
      setCategories((current) => current.filter((item) => item.id !== category.id));
      setMessage('Categoría eliminada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo eliminar la categoría');
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
      {message ? (
        <div className="notice-success" role="status">
          <Check size={17} /> {message}
          <button type="button" onClick={() => setMessage('')} aria-label="Cerrar mensaje">
            ×
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="notice-error" role="alert">
          {error}
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      ) : null}
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
                    </td>
                    <td>
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
        <div className="modal-backdrop">
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Editar categoría' : 'Agregar categoría'}
          >
            <div className="modal-top">
              <h2>{editing ? 'Editar categoría' : 'Agregar categoría'}</h2>
              <button
                className="modal-close"
                type="button"
                onClick={close}
                disabled={saving}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={(event) => void save(event)}>
              <label className="field-wide">
                <span>Nombre</span>
                <input
                  value={name}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej. Servicios"
                  required
                  autoFocus
                />
              </label>
              <div className="modal-actions">
                <button className="btn-secondary" type="button" onClick={close} disabled={saving}>
                  Cancelar
                </button>
                <button className="btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar categoría'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
