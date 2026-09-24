'use client';

import {
  Coins,
  Eye,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  Tags,
  Wallet,
  X,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoriaGastoFormModal } from '../../../components/CategoriaGastoFormModal';
import { DonutChart } from '../../../components/charts/DonutChart';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { PanelCard } from '../../../components/dashboard/PanelCard';
import { StatCard } from '../../../components/dashboard/StatCard';
import { PeriodFilter } from '../../../components/PeriodFilter';
import { ProveedorFormModal } from '../../../components/ProveedorFormModal';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { TrabajadorFormModal } from '../../../components/TrabajadorFormModal';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import {
  controlClass,
  fieldErrorClass,
  fieldHintClass,
  fieldLabelClass,
  fieldWideClass,
  modalActionsClass,
  modalFormClass,
  textareaClass,
} from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { Modal, ModalHeader } from '../../../components/ui/Modal';
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
import { puede } from '../../../lib/permissions';
import { getTrabajadores, nombreTrabajador, Trabajador } from '../../../lib/trabajadores';
import { usePermisos } from '../../../lib/useCurrentUser';

const localDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const emptyForm = (): CreateExpensePayload => ({
  fecha: localDate(),
  concepto: '',
  categoriaId: '',
  monto: 0,
  comprobante: '',
  observaciones: '',
  proveedorId: '',
  beneficiarioId: '',
  metodoPagoId: '',
});

export default function GastosPage() {
  const queryClient = useQueryClient();
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
  const permisos = usePermisos();
  const puedeCrearTrabajador = puede(permisos, 'trabajadores.administrar');
  const puedeCrearCategoria = puede(permisos, 'gastos.categorias.crear');

  // Cinco consultas independientes: con React Query cada una aísla su propio error de las
  // demás, así que no hace falta `cargarParcial` acá (una que falle no apaga el formulario
  // entero, que era justo el problema que ese helper resolvía a mano).
  const expensesQuery = useQuery({ queryKey: ['expenses'], queryFn: () => getExpenses() });
  const expenses = expensesQuery.data ?? [];
  const loading = expensesQuery.isPending;
  const load = expensesQuery.refetch;

  const categoriesQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: getExpenseCategories,
  });
  const expenseCategories = categoriesQuery.data ?? [];
  // Si el catálogo de categorías no llegó, la lista vacía no significa "no hay categorías"
  // sino "no se pudieron cargar", y el formulario tiene que decir eso y no lo otro.
  const fallaronCategorias = categoriesQuery.isError;

  const proveedoresQuery = useQuery({
    queryKey: ['expense-proveedores'],
    queryFn: getExpenseProveedores,
  });
  const proveedores = proveedoresQuery.data ?? [];

  const trabajadoresQuery = useQuery({
    queryKey: ['trabajadores', 'activos'],
    queryFn: () => getTrabajadores(true),
  });
  const trabajadores = trabajadoresQuery.data ?? [];

  const metodosQuery = useQuery({
    queryKey: ['operational-payment-methods'],
    queryFn: getOperationalPaymentMethods,
  });
  const metodos = metodosQuery.data ?? [];

  useEffect(() => {
    const fallo = [
      expensesQuery,
      categoriesQuery,
      proveedoresQuery,
      trabajadoresQuery,
      metodosQuery,
    ].find((query) => query.error)?.error;
    if (fallo) {
      toast.error(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los gastos', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    }
    // Deliberadamente solo depende de las referencias de error (no de los objetos `query`
    // completos, que cambian de identidad en cada render): un solo toast por fallo real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    expensesQuery.error,
    categoriesQuery.error,
    proveedoresQuery.error,
    trabajadoresQuery.error,
    metodosQuery.error,
  ]);

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
  // El formulario guarda el id de la categoría; el nombre sale del catálogo cuando hace
  // falta, que es para decidir si la categoría es la de pago a trabajador.
  const nombreCategoria = useCallback(
    (id: string) => expenseCategories.find((item) => item.id === id)?.nombre ?? '',
    [expenseCategories],
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

  // Desglose por categoría de lo que se está viendo. Se arma en el cliente sobre `visible`
  // para que siga al buscador y a los filtros, no solo al período.
  const porCategoria = useMemo(() => {
    const acumulado = new Map<string, { id: string; name: string; value: number; count: number }>();
    for (const gasto of visible) {
      const fila = acumulado.get(gasto.categoria) ?? {
        id: gasto.categoria,
        name: gasto.categoria,
        value: 0,
        count: 0,
      };
      fila.value += gasto.monto;
      fila.count += 1;
      acumulado.set(gasto.categoria, fila);
    }
    return [...acumulado.values()].sort((a, b) => b.value - a.value);
  }, [visible]);

  function openForm(expense?: Expense) {
    setEditing(expense ?? null);
    setForm(
      expense
        ? {
            fecha: expense.fecha.slice(0, 10),
            concepto: expense.concepto,
            categoriaId: expense.categoriaId,
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
    if (!form.categoriaId) {
      toast.error('Selecciona la categoría del gasto.');
      return;
    }
    const esPago = esPagoTrabajador(nombreCategoria(form.categoriaId));
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
      queryClient.setQueryData<Expense[]>(['expenses'], (current) =>
        editing
          ? current?.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...(current ?? [])],
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
    queryClient.setQueryData<ExpenseCategory[]>(['expense-categories'], (current) =>
      (current?.some((item) => item.id === categoria.id)
        ? current.map((item) => (item.id === categoria.id ? categoria : item))
        : [...(current ?? []), categoria]
      ).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    );
    setForm((current) => ({ ...current, categoriaId: categoria.id }));
    setCategoriaModal(false);
  }
  function handleProveedorCreado(proveedor: Proveedor) {
    queryClient.setQueryData<ExpenseProveedor[]>(['expense-proveedores'], (current) =>
      [
        ...(current ?? []),
        { id: proveedor.id, razonSocial: proveedor.razonSocial, estado: proveedor.estado },
      ].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es')),
    );
    setForm((current) => ({ ...current, proveedorId: proveedor.id }));
    setProveedorModal(false);
  }
  function handleTrabajadorCreado(trabajador: Trabajador) {
    queryClient.setQueryData<Trabajador[]>(['trabajadores', 'activos'], (current) =>
      [...(current ?? []), trabajador].sort((a, b) =>
        nombreTrabajador(a).localeCompare(nombreTrabajador(b), 'es'),
      ),
    );
    setForm((current) => ({ ...current, beneficiarioId: trabajador.id }));
    setTrabajadorModal(false);
  }

  const columns: DataTableColumn<Expense>[] = [
    { key: 'fecha', header: 'Fecha', render: (item) => fechaCorta(item.fecha) },
    {
      key: 'concepto',
      header: 'Concepto',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.concepto}</strong>
          {item.comprobante ? (
            <small className="mt-0.5 block text-[11px] text-muted">
              Comprobante {item.comprobante}
            </small>
          ) : null}
        </>
      ),
    },
    {
      key: 'categoria',
      header: 'Categoría',
      render: (item) => <Badge tone="amber">{item.categoria}</Badge>,
    },
    {
      key: 'contraparte',
      header: 'Proveedor / trabajador',
      render: (item) =>
        item.beneficiario ? (
          <>
            <strong className="block text-[13px] font-medium text-fg">{item.beneficiario}</strong>
            <small className="mt-0.5 block text-[11px] text-muted">
              {CATEGORIA_PAGO_TRABAJADOR}
            </small>
          </>
        ) : (
          item.proveedor || '—'
        ),
    },
    {
      key: 'monto',
      header: 'Monto',
      render: (item) => (
        <strong className="text-[13px] font-medium text-fg">{moneda(item.monto)}</strong>
      ),
    },
    { key: 'registrado', header: 'Registrado por', render: (item) => item.registradoPor || '—' },
    {
      key: 'acciones',
      header: '',
      cardLabel: null,
      render: (item) => (
        <div className="flex flex-wrap gap-[7px]">
          <IconButton
            onClick={(event) => {
              event.stopPropagation();
              setDetail(item);
            }}
            title="Ver detalle"
            aria-label={`Ver detalle de ${item.concepto}`}
          >
            <Eye size={16} />
          </IconButton>
          <IconButton
            onClick={(event) => {
              event.stopPropagation();
              openForm(item);
            }}
            title="Editar gasto"
            aria-label={`Editar ${item.concepto}`}
          >
            <Pencil size={16} />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="module-page operations-list-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Finanzas</span>
          <h1>Gastos</h1>
        </div>
        <Button
          className="min-h-[44px] shrink-0 px-[19px]"
          type="button"
          onClick={() => openForm()}
        >
          <Plus size={18} /> Registrar gasto
        </Button>
      </div>
      <div className="stat-grid">
        <StatCard
          icon={<Wallet size={19} />}
          label="Gastos totales"
          value={moneda(total)}
          detail="Egresos del período"
          tone="amber"
        />
        <StatCard
          icon={<Tags size={19} />}
          label="Categorías"
          value={categories.length}
          detail="En uso en el negocio"
          tone="violet"
        />
        <StatCard
          icon={<ReceiptText size={19} />}
          label="Registros"
          value={visible.length}
          detail="Gastos que estás viendo"
          tone="blue"
        />
        <StatCard
          icon={<Coins size={19} />}
          label="Gasto promedio"
          value={moneda(visible.length ? total / visible.length : 0)}
          detail="Por registro"
          tone="green"
        />
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
        <Button variant="secondary" type="button" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal size={16} /> Filtros{category !== 'Todas' ? ` (${category})` : ''}
        </Button>
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
          <Button type="button" onClick={() => openForm()}>
            <Plus size={17} /> Registrar gasto
          </Button>
        </div>
      ) : (
        <>
          <PanelCard title="Gastos por categoría">
            <DonutChart rows={porCategoria} centerLabel="Total" />
          </PanelCard>

          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(item) => item.id}
            onRowClick={(item) => setDetail(item)}
            emptyMessage={
              <div className="flex flex-col items-center gap-2.5">
                <Search size={22} />
                <span>No hay gastos que coincidan con los filtros.</span>
                <button
                  type="button"
                  className="text-accent underline"
                  onClick={() => {
                    setSearch('');
                    setCategory('Todas');
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
            }
          />
        </>
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
            <div className={modalFormClass}>
              <label className={fieldWideClass}>
                <span className={fieldLabelClass}>Categoría</span>
                <select
                  className={controlClass}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option>Todas</option>
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <Button
                variant="secondary"
                className={fieldWideClass}
                type="button"
                onClick={() => setCategory('Todas')}
                disabled={category === 'Todas'}
              >
                Limpiar filtros
              </Button>
            </div>
          </section>
        </div>
      ) : null}
      {detail ? (
        <Modal onClose={() => setDetail(null)}>
          <ModalHeader
            eyebrow="Detalle del gasto"
            title={detail.concepto}
            subtitle={fechaCorta(detail.fecha)}
            onClose={() => setDetail(null)}
            closeLabel="Cerrar detalle"
          />
          <div className="operation-detail">
            <div className="expense-detail-hero">
              <div>
                <small>Monto del gasto</small>
                <strong>{moneda(detail.monto)}</strong>
              </div>
              <Badge tone="amber">{detail.categoria}</Badge>
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
          <div className={modalActionsClass}>
            <Button variant="secondary" type="button" onClick={() => setDetail(null)}>
              Cerrar
            </Button>
            <Button type="button" onClick={() => openForm(detail)}>
              <Pencil size={16} /> Editar
            </Button>
          </div>
        </Modal>
      ) : null}
      {open ? (
        <>
          <Modal onClose={closeForm} closeDisabled={saving}>
            <ModalHeader
              title={editing ? 'Editar gasto' : 'Registrar gasto'}
              onClose={closeForm}
              closeDisabled={saving}
            />
            <form className={modalFormClass} onSubmit={(event) => void submit(event)}>
              <label>
                <span className={fieldLabelClass}>Fecha</span>
                <input
                  className={controlClass}
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
                <span className={fieldLabelClass}>Monto (S/)</span>
                <input
                  className={controlClass}
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
                <span className={fieldLabelClass}>Método de pago (opcional)</span>
                <SearchableSelect
                  value={form.metodoPagoId ?? ''}
                  onChange={(value) => setForm((current) => ({ ...current, metodoPagoId: value }))}
                  options={metodos.map((item) => ({ value: item.id, label: item.nombre }))}
                  placeholder="Con qué se pagó"
                />
              </label>
              <label>
                <span className={fieldLabelClass}>Categoría</span>
                <SearchableSelect
                  value={form.categoriaId}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      categoriaId: value,
                      // Al salir de "Pago a trabajador" el beneficiario deja de tener
                      // sentido y el API lo rechazaría.
                      beneficiarioId: esPagoTrabajador(nombreCategoria(value))
                        ? current.beneficiarioId
                        : '',
                    }))
                  }
                  options={expenseCategories.map((item) => ({
                    value: item.id,
                    label: item.nombre,
                  }))}
                  placeholder="Buscar categoría"
                  required
                  actionLabel={puedeCrearCategoria ? '+ Agregar categoría' : undefined}
                  onAction={puedeCrearCategoria ? () => setCategoriaModal(true) : undefined}
                />
                {/* Una lista vacía puede significar dos cosas muy distintas, y antes las dos
                      decían lo mismo: que faltaba crear una categoría. Si la carga falló, lo
                      que hace falta es reintentar, no crear nada. */}
                {fallaronCategorias ? (
                  <small className={fieldErrorClass}>
                    No se pudieron cargar las categorías.{' '}
                    <button type="button" className="link-button" onClick={() => void load()}>
                      Reintentar
                    </button>
                  </small>
                ) : !expenseCategories.length ? (
                  <small className={fieldErrorClass}>
                    Crea una categoría antes de registrar el gasto.
                  </small>
                ) : null}
              </label>
              {esPagoTrabajador(nombreCategoria(form.categoriaId)) ? (
                <label className={fieldWideClass}>
                  <span className={fieldLabelClass}>Trabajador al que se le paga</span>
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
                  <small className={fieldHintClass}>
                    Este pago aparecerá en el reporte del trabajador.
                  </small>
                </label>
              ) : null}
              <label className={fieldWideClass}>
                <span className={fieldLabelClass}>Concepto</span>
                <input
                  className={controlClass}
                  maxLength={200}
                  value={form.concepto}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, concepto: event.target.value }))
                  }
                  placeholder="Ej. Pago de electricidad"
                  required
                />
              </label>
              <details className={`production-advanced ${fieldWideClass}`}>
                <summary>Opciones avanzadas: proveedor y comprobante</summary>
                <p>Complétalas solo si el gasto está ligado a un proveedor o a un comprobante.</p>
                <div className="production-inputs">
                  <label>
                    <span className={fieldLabelClass}>Proveedor (opcional)</span>
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
                    <span className={fieldLabelClass}>Comprobante (opcional)</span>
                    <input
                      className={controlClass}
                      maxLength={50}
                      value={form.comprobante}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, comprobante: event.target.value }))
                      }
                      placeholder="N.° de recibo o referencia"
                    />
                  </label>
                  <label>
                    <span className={fieldLabelClass}>Observaciones (opcional)</span>
                    <textarea
                      className={textareaClass}
                      value={form.observaciones}
                      maxLength={500}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, observaciones: event.target.value }))
                      }
                    />
                  </label>
                </div>
              </details>
              <div className={modalActionsClass}>
                <Button variant="secondary" type="button" onClick={closeForm} disabled={saving}>
                  Cancelar
                </Button>
                <Button disabled={saving || !expenseCategories.length}>
                  {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar gasto'}
                </Button>
              </div>
            </form>
          </Modal>
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
