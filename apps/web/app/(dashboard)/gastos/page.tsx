'use client';

import { Check, Plus, ReceiptText, Search, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { PeriodFilter } from '../../../components/PeriodFilter';
import {
  CreateExpensePayload,
  createExpense,
  Expense,
  ExpenseCategory,
  getExpenseCategories,
  getExpenses,
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
});

export default function GastosPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [form, setForm] = useState<CreateExpensePayload>(emptyForm);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [expenseData, categoryData] = await Promise.all([
        getExpenses(),
        getExpenseCategories(),
      ]);
      setExpenses(expenseData);
      setExpenseCategories(categoryData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los gastos');
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
  const visible = useMemo(
    () =>
      expenses.filter((item) => {
        const fecha = item.fecha.slice(0, 10);
        return (
          (category === 'Todas' || item.categoria === category) &&
          (!from || fecha >= from) &&
          (!to || fecha <= to) &&
          `${item.concepto} ${item.categoria} ${item.comprobante ?? ''}`
            .toLowerCase()
            .includes(search.toLowerCase())
        );
      }),
    [category, expenses, from, search, to],
  );
  const total = visible.reduce((sum, item) => sum + item.monto, 0);
  const changePeriod = useCallback((start: string, end: string) => {
    setFrom(start);
    setTo(end);
  }, []);

  function closeForm() {
    setOpen(false);
    setForm(emptyForm());
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await createExpense(form);
      setExpenses((current) => [created, ...current]);
      setMessage('Gasto registrado correctamente.');
      closeForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el gasto');
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
          onClick={() => setOpen(true)}
        >
          <Plus size={18} /> Registrar gasto
        </button>
      </div>
      <div className="summary-row">
        <div className="summary-glass">
          <span>Gastos registrados</span>
          <strong>S/ {expenses.reduce((sum, item) => sum + item.monto, 0).toFixed(2)}</strong>
        </div>
        <div className="summary-glass">
          <span>Este listado</span>
          <strong>S/ {total.toFixed(2)}</strong>
        </div>
        <div className="summary-glass">
          <span>Categorías</span>
          <strong>{categories.length}</strong>
        </div>
        <div className="summary-glass">
          <span>Registros</span>
          <strong>{expenses.length}</strong>
        </div>
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
      <div className="module-tools operations-filters">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar concepto, categoría o comprobante"
          />
        </label>
        <label className="filter-field">
          <span>Categoría</span>
          <select
            className="filter-pill"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option>Todas</option>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <PeriodFilter onChange={changePeriod} />
      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando gastos...
        </div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <ReceiptText size={34} />
          <h2>Aún no hay gastos</h2>
          <p>Registra el primer egreso para compararlo con las ventas.</p>
          <button className="btn-primary" type="button" onClick={() => setOpen(true)}>
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
                <th>Comprobante</th>
                <th>Monto</th>
                <th>Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {new Date(`${item.fecha.slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE')}
                    </td>
                    <td>
                      <strong>{item.concepto}</strong>
                      {item.observaciones ? <small>{item.observaciones}</small> : null}
                    </td>
                    <td>
                      <span className="status status-amber">{item.categoria}</span>
                    </td>
                    <td>{item.comprobante || '—'}</td>
                    <td>
                      <strong>S/ {item.monto.toFixed(2)}</strong>
                    </td>
                    <td>{item.registradoPor || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
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
      {open ? (
        <div className="modal-backdrop">
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Registrar gasto"
          >
            <div className="modal-top">
              <div>
                <h2>Registrar gasto</h2>
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
                  {saving ? 'Registrando...' : 'Registrar gasto'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
