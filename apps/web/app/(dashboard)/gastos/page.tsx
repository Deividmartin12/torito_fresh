'use client';

import { Pencil, Plus, ReceiptText, Search, SlidersHorizontal, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { moneda } from '../../../lib/format';
import {
  CreateExpensePayload,
  createExpense,
  Expense,
  ExpenseCategory,
  ExpenseProveedor,
  getExpenseCategories,
  getExpenseProveedores,
  getExpenses,
  updateExpense,
} from '../../../lib/expenses';

const localDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const emptyForm = (): CreateExpensePayload => ({
  fecha: localDate(),
  concepto: '',
  categoria: '',
  monto: 0,
  comprobante: '',
  observaciones: '',
  proveedorId: '',
});

export default function GastosPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [proveedores, setProveedores] = useState<ExpenseProveedor[]>([]);
  const [form, setForm] = useState<CreateExpensePayload>(emptyForm);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [detail, setDetail] = useState<Expense | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [expenseData, categoryData, proveedorData] = await Promise.all([
        getExpenses(),
        getExpenseCategories(),
        getExpenseProveedores(),
      ]);
      setExpenses(expenseData);
      setExpenseCategories(categoryData);
      setProveedores(proveedorData);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar los gastos', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () =>
      [
        ...new Set([
          ...expenseCategories.map((item) => item.nombre),
          ...expenses.map((item) => item.categoria),
        ]),
      ].sort(),
    [expenseCategories, expenses],
  );
  // Se cargan todos los gastos (más nuevos primero, orden del servidor); aquí solo se
  // refina por categoría y texto.
  const visible = useMemo(
    () =>
      expenses.filter(
        (item) =>
          (category === 'Todas' || item.categoria === category) &&
          `${item.concepto} ${item.categoria} ${item.comprobante ?? ''}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [category, expenses, search],
  );
  const total = visible.reduce((sum, item) => sum + item.monto, 0);

  function openForm(expense?: Expense) {
    setEditing(expense ?? null);
    setForm(
      expense
        ? {
            fecha: expense.fecha.slice(0, 10),
            concepto: expense.concepto,
            categoria: expense.categoria,
            monto: expense.monto,
            comprobante: expense.comprobante ?? '',
            observaciones: expense.observaciones ?? '',
            proveedorId: expense.proveedorId ?? '',
          }
        : emptyForm(),
    );
    setDetail(null);
    setOpen(true);
  }
  function closeForm() {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm());
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, proveedorId: form.proveedorId || undefined };
      const saved = editing ? await updateExpense(editing.id, payload) : await createExpense(payload);
      setExpenses((current) =>
        editing
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current],
      );
      toast.success(editing ? 'Gasto actualizado correctamente.' : 'Gasto registrado correctamente.');
      closeForm();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar el gasto', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="module-page operations-list-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Finanzas</span>
          <h1>Gastos</h1>
          <p>Registra los egresos del negocio. No afectan productos ni inventario.</p>
        </div>
        <button
          className="btn-primary operation-primary-action"
          type="button"
          onClick={() => openForm()}
        >
          <Plus size={18} /> Registrar gasto
        </button>
      </div>
      <div className="summary-row">
        <div className="summary-glass">
          <span>Gastos totales</span>
          <strong>{moneda(total)}</strong>
        </div>
        <div className="summary-glass">
          <span>Categorías</span>
          <strong>{categories.length}</strong>
        </div>
        <div className="summary-glass">
          <span>Registros</span>
          <strong>{visible.length}</strong>
        </div>
      </div>
      <div className="module-tools operations-filters">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar concepto, categoría o comprobante"
          />
        </label>
        <button className="btn-secondary" type="button" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal size={16} /> Filtros{category !== 'Todas' ? ` (${category})` : ''}
        </button>
      </div>
      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando gastos...
        </div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <ReceiptText size={34} />
          <h2>Aún no hay gastos</h2>
          <p>Registra el primer egreso para compararlo con las ventas.</p>
          <button className="btn-primary" type="button" onClick={() => openForm()}>
            <Plus size={17} /> Registrar gasto
          </button>
        </div>
      ) : (
        <div className="glass-table">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Categoría</th>
                <th>Proveedor</th>
                <th>Monto</th>
                <th>Registrado por</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((item) => (
                  <tr key={item.id} className="clickable-row" onClick={() => setDetail(item)}>
                    <td>
                      {new Date(`${item.fecha.slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE')}
                    </td>
                    <td>
                      <strong>{item.concepto}</strong>
                      {item.comprobante ? <small>Comprobante {item.comprobante}</small> : null}
                    </td>
                    <td>
                      <span className="status status-amber">{item.categoria}</span>
                    </td>
                    <td>{item.proveedor || '—'}</td>
                    <td>
                      <strong>{moneda(item.monto)}</strong>
                    </td>
                    <td>{item.registradoPor || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="icon-soft"
                        onClick={(event) => {
                          event.stopPropagation();
                          openForm(item);
                        }}
                        title="Editar gasto"
                        aria-label={`Editar ${item.concepto}`}
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <div className="table-empty">
                      <Search size={22} />
                      <span>No hay gastos que coincidan con los filtros.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setCategory('Todas');
                        }}
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {filtersOpen ? (
        <div
          className="filters-drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFiltersOpen(false);
          }}
        >
          <section className="filters-drawer" role="dialog" aria-modal="true" aria-label="Filtros">
            <div className="modal-top">
              <h2>Filtros</h2>
              <button
                className="modal-close"
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label="Cerrar filtros"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-form">
              <label className="field-wide">
                <span>Categoría</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option>Todas</option>
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <button
                className="btn-secondary field-wide"
                type="button"
                onClick={() => setCategory('Todas')}
                disabled={category === 'Todas'}
              >
                Limpiar filtros
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {detail ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetail(null);
          }}
        >
          <section className="crud-modal" role="dialog" aria-modal="true" aria-label="Detalle del gasto">
            <div className="modal-top">
              <div>
                <h2>{detail.concepto}</h2>
                <small>{new Date(`${detail.fecha.slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE')}</small>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setDetail(null)}
                aria-label="Cerrar detalle"
              >
                <X size={18} />
              </button>
            </div>
            <div className="operation-detail-items">
              <div className="detail-line">
                <span>Categoría</span>
                <strong>{detail.categoria}</strong>
              </div>
              <div className="detail-line">
                <span>Monto</span>
                <strong>{moneda(detail.monto)}</strong>
              </div>
              <div className="detail-line">
                <span>Proveedor</span>
                <strong>{detail.proveedor || 'Sin proveedor'}</strong>
              </div>
              <div className="detail-line">
                <span>Comprobante</span>
                <strong>{detail.comprobante || '—'}</strong>
              </div>
              <div className="detail-line">
                <span>Observaciones</span>
                <strong>{detail.observaciones || '—'}</strong>
              </div>
              <div className="detail-line">
                <span>Registrado por</span>
                <strong>{detail.registradoPor || '—'}</strong>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" type="button" onClick={() => setDetail(null)}>
                Cerrar
              </button>
              <button className="btn-primary" type="button" onClick={() => openForm(detail)}>
                <Pencil size={16} /> Editar
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {open ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) closeForm();
          }}
        >
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Editar gasto' : 'Registrar gasto'}
          >
            <div className="modal-top">
              <div>
                <h2>{editing ? 'Editar gasto' : 'Registrar gasto'}</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={closeForm}
                disabled={saving}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={(event) => void submit(event)}>
              <label>
                <span>Fecha</span>
                <input
                  type="date"
                  max={localDate()}
                  value={form.fecha}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fecha: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                <span>Monto (S/)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.monto || ''}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, monto: Number(event.target.value) }))
                  }
                  required
                />
              </label>
              <label>
                <span>Categoría</span>
                <select
                  value={form.categoria}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, categoria: event.target.value }))
                  }
                  required
                >
                  <option value="">Seleccionar categoría</option>
                  {expenseCategories.map((item) => (
                    <option value={item.nombre} key={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
                {!expenseCategories.length ? (
                  <small className="field-error">
                    Crea una categoría antes de registrar el gasto.
                  </small>
                ) : null}
              </label>
              <label className="field-wide">
                <span>Concepto</span>
                <input
                  maxLength={200}
                  value={form.concepto}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, concepto: event.target.value }))
                  }
                  placeholder="Ej. Pago de electricidad"
                  required
                />
              </label>
              <details className="production-advanced field-wide">
                <summary>Opciones avanzadas: proveedor y comprobante</summary>
                <p>Complétalas solo si el gasto está ligado a un proveedor o a un comprobante.</p>
                <div className="production-inputs">
                  <label>
                    <span>Proveedor (opcional)</span>
                    <select
                      value={form.proveedorId}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, proveedorId: event.target.value }))
                      }
                    >
                      <option value="">Sin proveedor</option>
                      {proveedores.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.razonSocial}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Comprobante (opcional)</span>
                    <input
                      maxLength={50}
                      value={form.comprobante}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, comprobante: event.target.value }))
                      }
                      placeholder="N.° de recibo o referencia"
                    />
                  </label>
                  <label>
                    <span>Observaciones (opcional)</span>
                    <textarea
                      value={form.observaciones}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, observaciones: event.target.value }))
                      }
                    />
                  </label>
                </div>
              </details>
              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button className="btn-primary" disabled={saving || !expenseCategories.length}>
                  {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar gasto'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
