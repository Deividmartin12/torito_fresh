'use client';

import { Eye, Pencil, Plus, ReceiptText, Search, SlidersHorizontal, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoriaGastoFormModal } from '../../../components/CategoriaGastoFormModal';
import { PeriodFilter } from '../../../components/PeriodFilter';
import { ProveedorFormModal } from '../../../components/ProveedorFormModal';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { TrabajadorFormModal } from '../../../components/TrabajadorFormModal';
import { fechaCorta, moneda } from '../../../lib/format';
import {
  CATEGORIA_PAGO_TRABAJADOR,
  CreateExpensePayload,
  createExpense,
  esPagoTrabajador,
  Expense,
  ExpenseCategory,
  ExpenseProveedor,
  getExpenseCategories,
  getExpenseProveedores,
  getExpenses,
  updateExpense,
} from '../../../lib/expenses';
import { getOperationalPaymentMethods, OperationalPaymentMethod } from '../../../lib/operations';
import { Proveedor } from '../../../lib/proveedores';
import { getTrabajadores, nombreTrabajador, Trabajador } from '../../../lib/trabajadores';
import { useRole } from '../../../lib/useCurrentUser';

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
  beneficiarioId: '',
  metodoPagoId: '',
});

export default function GastosPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [proveedores, setProveedores] = useState<ExpenseProveedor[]>([]);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [metodos, setMetodos] = useState<OperationalPaymentMethod[]>([]);
  const [form, setForm] = useState<CreateExpensePayload>(emptyForm);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [rango, setRango] = useState<{ from: string; to: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [detail, setDetail] = useState<Expense | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoriaModal, setCategoriaModal] = useState(false);
  const [proveedorModal, setProveedorModal] = useState(false);
  const [trabajadorModal, setTrabajadorModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  // Dar de alta un trabajador es exclusivo de ADMIN (`POST /trabajadores`), así que al
  // resto se le oculta la acción inline en vez de dejar que reciba un 403.
  const puedeCrearTrabajador = useRole() === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [expenseData, categoryData, proveedorData, trabajadorData, metodoData] =
        await Promise.all([
          getExpenses(),
          getExpenseCategories(),
          getExpenseProveedores(),
          getTrabajadores(true),
          getOperationalPaymentMethods(),
        ]);
      setExpenses(expenseData);
      setExpenseCategories(categoryData);
      setProveedores(proveedorData);
      setTrabajadores(trabajadorData);
      setMetodos(metodoData);
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
  const handlePeriod = useCallback((from: string, to: string) => {
    setRango({ from, to });
  }, []);

  // Se cargan todos los gastos (más nuevos primero, orden del servidor); aquí solo se
  // refina por período, categoría y texto.
  const visible = useMemo(
    () =>
      expenses.filter(
        (item) =>
          (category === 'Todas' || item.categoria === category) &&
          (!rango ||
            (item.fecha.slice(0, 10) >= rango.from && item.fecha.slice(0, 10) <= rango.to)) &&
          `${item.concepto} ${item.categoria} ${item.comprobante ?? ''}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [category, expenses, rango, search],
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
            beneficiarioId: expense.beneficiarioId ?? '',
            metodoPagoId: expense.metodoPagoId ?? '',
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
    if (!form.concepto.trim()) {
      toast.error('Ingresa el concepto del gasto.');
      return;
    }
    if (!Number.isFinite(form.monto) || form.monto < 0.01) {
      toast.error('El monto debe ser mayor a 0.');
      return;
    }
    const esPago = esPagoTrabajador(form.categoria);
    if (esPago && !form.beneficiarioId) {
      toast.error('Selecciona el trabajador al que se le está pagando.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        concepto: form.concepto.trim(),
        comprobante: (form.comprobante ?? '').trim() || undefined,
        observaciones: (form.observaciones ?? '').trim() || undefined,
        proveedorId: form.proveedorId || undefined,
        metodoPagoId: form.metodoPagoId || undefined,
        // El beneficiario solo viaja en la categoría de pago a trabajador: el API rechaza
        // el gasto si llega en cualquier otra.
        beneficiarioId: esPago ? form.beneficiarioId : undefined,
      };
      const saved = editing
        ? await updateExpense(editing.id, payload)
        : await createExpense(payload);
      setExpenses((current) =>
        editing
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current],
      );
      toast.success(
        editing ? 'Gasto actualizado correctamente.' : 'Gasto registrado correctamente.',
      );
      closeForm();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar el gasto', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    } finally {
      setSaving(false);
    }
  }

  function handleCategoriaCreada(categoria: ExpenseCategory) {
    setExpenseCategories((current) =>
      (current.some((item) => item.id === categoria.id)
        ? current.map((item) => (item.id === categoria.id ? categoria : item))
        : [...current, categoria]
      ).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    );
    setForm((current) => ({ ...current, categoria: categoria.nombre }));
    setCategoriaModal(false);
  }
  function handleProveedorCreado(proveedor: Proveedor) {
    setProveedores((current) =>
      [
        ...current,
        { id: proveedor.id, razonSocial: proveedor.razonSocial, estado: proveedor.estado },
      ].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es')),
    );
    setForm((current) => ({ ...current, proveedorId: proveedor.id }));
    setProveedorModal(false);
  }
  function handleTrabajadorCreado(trabajador: Trabajador) {
    setTrabajadores((current) =>
      [...current, trabajador].sort((a, b) =>
        nombreTrabajador(a).localeCompare(nombreTrabajador(b), 'es'),
      ),
    );
    setForm((current) => ({ ...current, beneficiarioId: trabajador.id }));
    setTrabajadorModal(false);
  }

  return (
    <div className="module-page operations-list-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Finanzas</span>
          <h1>Gastos</h1>
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
      <PeriodFilter defaultPeriod="month" onChange={handlePeriod} />

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
                <th>Proveedor / trabajador</th>
                <th>Monto</th>
                <th>Registrado por</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((item) => (
                  <tr key={item.id} className="clickable-row" onClick={() => setDetail(item)}>
                    <td>{fechaCorta(item.fecha)}</td>
                    <td>
                      <strong>{item.concepto}</strong>
                      {item.comprobante ? <small>Comprobante {item.comprobante}</small> : null}
                    </td>
                    <td>
                      <span className="status status-amber">{item.categoria}</span>
                    </td>
                    <td>
                      {item.beneficiario ? (
                        <>
                          <strong>{item.beneficiario}</strong>
                          <small>{CATEGORIA_PAGO_TRABAJADOR}</small>
                        </>
                      ) : (
                        item.proveedor || '—'
                      )}
                    </td>
                    <td>
                      <strong>{moneda(item.monto)}</strong>
                    </td>
                    <td>{item.registradoPor || '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-soft"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDetail(item);
                          }}
                          title="Ver detalle"
                          aria-label={`Ver detalle de ${item.concepto}`}
                        >
                          <Eye size={16} />
                        </button>
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
                      </div>
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
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle del gasto"
          >
            <div className="modal-top">
              <div>
                <span className="operation-eyebrow">Detalle del gasto</span>
                <h2>{detail.concepto}</h2>
                <small>{fechaCorta(detail.fecha)}</small>
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
            <div className="operation-detail">
              <div className="expense-detail-hero">
                <div>
                  <small>Monto del gasto</small>
                  <strong>{moneda(detail.monto)}</strong>
                </div>
                <span className="status status-amber">{detail.categoria}</span>
              </div>
              <div className="detail-summary">
                <span>
                  Fecha<strong>{fechaCorta(detail.fecha)}</strong>
                </span>
                {detail.beneficiario ? (
                  <span>
                    Se le pagó a<strong>{detail.beneficiario}</strong>
                  </span>
                ) : (
                  <span>
                    Proveedor<strong>{detail.proveedor || 'Sin proveedor'}</strong>
                  </span>
                )}
                <span>
                  Método de pago<strong>{detail.metodoPago || 'Sin registrar'}</strong>
                </span>
                <span>
                  Comprobante<strong>{detail.comprobante || '—'}</strong>
                </span>
                <span>
                  Registrado por<strong>{detail.registradoPor || '—'}</strong>
                </span>
              </div>
              {detail.observaciones ? (
                <div className="operation-review-note">
                  <small>Observaciones</small>
                  <p>{detail.observaciones}</p>
                </div>
              ) : null}
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
        <>
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
                  <span>Método de pago (opcional)</span>
                  <SearchableSelect
                    value={form.metodoPagoId ?? ''}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, metodoPagoId: value }))
                    }
                    options={metodos.map((item) => ({ value: item.id, label: item.nombre }))}
                    placeholder="Con qué se pagó"
                  />
                </label>
                <label>
                  <span>Categoría</span>
                  <SearchableSelect
                    value={form.categoria}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        categoria: value,
                        // Al salir de "Pago a trabajador" el beneficiario deja de tener
                        // sentido y el API lo rechazaría.
                        beneficiarioId: esPagoTrabajador(value) ? current.beneficiarioId : '',
                      }))
                    }
                    options={expenseCategories.map((item) => ({
                      value: item.nombre,
                      label: item.nombre,
                    }))}
                    placeholder="Buscar categoría"
                    required
                    actionLabel="+ Agregar categoría"
                    onAction={() => setCategoriaModal(true)}
                  />
                  {!expenseCategories.length ? (
                    <small className="field-error">
                      Crea una categoría antes de registrar el gasto.
                    </small>
                  ) : null}
                </label>
                {esPagoTrabajador(form.categoria) ? (
                  <label className="field-wide">
                    <span>Trabajador al que se le paga</span>
                    <SearchableSelect
                      value={form.beneficiarioId ?? ''}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, beneficiarioId: value }))
                      }
                      options={trabajadores.map((item) => ({
                        value: item.id,
                        label: nombreTrabajador(item),
                        hint: item.cargo,
                      }))}
                      placeholder="Buscar trabajador"
                      required
                      actionLabel={puedeCrearTrabajador ? '+ Agregar trabajador' : undefined}
                      onAction={puedeCrearTrabajador ? () => setTrabajadorModal(true) : undefined}
                    />
                    <small className="field-hint">
                      Este pago aparecerá en el reporte del trabajador.
                    </small>
                  </label>
                ) : null}
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
                      <SearchableSelect
                        value={form.proveedorId ?? ''}
                        onChange={(value) =>
                          setForm((current) => ({ ...current, proveedorId: value }))
                        }
                        options={proveedores.map((item) => ({
                          value: item.id,
                          label: item.razonSocial,
                        }))}
                        placeholder="Buscar proveedor"
                        actionLabel="+ Agregar proveedor"
                        onAction={() => setProveedorModal(true)}
                      />
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
                        maxLength={500}
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
          {categoriaModal ? (
            <CategoriaGastoFormModal
              onClose={() => setCategoriaModal(false)}
              onSaved={handleCategoriaCreada}
            />
          ) : null}
          {proveedorModal ? (
            <ProveedorFormModal
              onClose={() => setProveedorModal(false)}
              onSaved={handleProveedorCreado}
            />
          ) : null}
          {trabajadorModal ? (
            <TrabajadorFormModal
              onClose={() => setTrabajadorModal(false)}
              onSaved={handleTrabajadorCreado}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
