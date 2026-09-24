'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoriaGastoFormModal } from '../../../components/CategoriaGastoFormModal';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { AddButton } from '../../../components/ui/AddButton';
import { Badge } from '../../../components/ui/Badge';
import { IconButton } from '../../../components/ui/IconButton';
import {
  deleteExpenseCategory,
  ExpenseCategory,
  getExpenseCategories,
} from '../../../lib/expenses';

export default function ExpenseCategoriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);

  // Misma clave que usa /gastos: crear o borrar una categoría acá también la actualiza allá,
  // sin depender de quién visite qué pantalla primero.
  const query = useQuery({ queryKey: ['expense-categories'], queryFn: getExpenseCategories });
  const categories = query.data ?? [];
  const loading = query.isPending;
  const load = query.refetch;
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error ? query.error.message : 'No se pudieron cargar las categorías',
        { action: { label: 'Reintentar', onClick: () => void query.refetch() } },
      );
    }
  }, [query.error, query.refetch]);
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
    queryClient.setQueryData<ExpenseCategory[]>(['expense-categories'], (current) =>
      (current?.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...(current ?? []), saved]
      ).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    );
    close();
  }
  async function remove(category: ExpenseCategory) {
    if (!window.confirm(`¿Eliminar la categoría ${category.nombre}?`)) return;
    try {
      await deleteExpenseCategory(category.id);
      queryClient.setQueryData<ExpenseCategory[]>(['expense-categories'], (current) =>
        current?.filter((item) => item.id !== category.id),
      );
      toast.success('Categoría eliminada.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo eliminar la categoría', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    }
  }

  const columns: DataTableColumn<ExpenseCategory>[] = [
    {
      key: 'categoria',
      header: 'Categoría',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.nombre}</strong>
          {item.sistema ? (
            <small className="mt-0.5 block text-[11px] text-muted">
              Categoría fija del sistema
            </small>
          ) : null}
        </>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      cardLabel: null,
      render: (item) =>
        // Las categorías del sistema son parte de la lógica de la app: "Pago a trabajador" es la
        // que enlaza el gasto con su beneficiario, así que ni se renombra ni se elimina (el API
        // también lo bloquea).
        item.sistema ? (
          <Badge tone="green">
            <Lock size={12} /> Protegida
          </Badge>
        ) : (
          <div className="flex flex-wrap gap-[7px]">
            <IconButton onClick={() => openForm(item)} title="Editar categoría">
              <Pencil size={16} />
            </IconButton>
            <IconButton onClick={() => void remove(item)} title="Eliminar categoría">
              <Trash2 size={16} />
            </IconButton>
          </div>
        ),
    },
  ];

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Categorías de gasto</h1>
          <span>{categories.length} categorías registradas</span>
        </div>
        <AddButton label="Agregar categoría" onClick={() => openForm()} />
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
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(item) => item.id}
        loading={loading}
        loadingLabel="Cargando categorías..."
        emptyMessage={
          <div className="flex flex-col items-center gap-2.5">
            <span>No hay categorías que coincidan.</span>
            <button type="button" className="text-accent underline" onClick={() => setSearch('')}>
              Limpiar búsqueda
            </button>
          </div>
        }
      />
      {open ? (
        <CategoriaGastoFormModal editando={editing} onClose={close} onSaved={handleSaved} />
      ) : null}
    </div>
  );
}
