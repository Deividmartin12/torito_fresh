'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { PaymentMethodCategoryFormModal } from '../../../components/PaymentMethodCategoryFormModal';
import { AddButton } from '../../../components/ui/AddButton';
import { Badge } from '../../../components/ui/Badge';
import { IconButton } from '../../../components/ui/IconButton';
import {
  deletePaymentMethodCategory,
  getPaymentMethodCategories,
  PaymentMethodCategory,
} from '../../../lib/payment-methods';

export default function PaymentMethodCategoriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethodCategory | null>(null);

  // Clave estable para que las altas, ediciones y eliminaciones actualicen esta lista sin
  // volver a pedir todo el catálogo.
  const query = useQuery({
    queryKey: ['payment-method-categories'],
    queryFn: getPaymentMethodCategories,
  });
  const categories = query.data ?? [];
  const loading = query.isPending;

  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error
          ? query.error.message
          : 'No se pudieron cargar las categorías de métodos de pago',
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

  function openForm(category?: PaymentMethodCategory) {
    setEditing(category ?? null);
    setOpen(true);
  }

  function handleSaved(saved: PaymentMethodCategory) {
    queryClient.setQueryData<PaymentMethodCategory[]>(['payment-method-categories'], (current) =>
      (current?.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...(current ?? []), saved]
      ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    );
    close();
  }

  async function remove(category: PaymentMethodCategory) {
    if (category.metodos > 0) return;
    if (!window.confirm(`¿Eliminar la categoría ${category.nombre}?`)) return;
    try {
      await deletePaymentMethodCategory(category.id);
      queryClient.setQueryData<PaymentMethodCategory[]>(['payment-method-categories'], (current) =>
        current?.filter((item) => item.id !== category.id),
      );
      toast.success('Categoría eliminada.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo eliminar la categoría', {
        action: { label: 'Reintentar', onClick: () => void query.refetch() },
      });
    }
  }

  const columns: DataTableColumn<PaymentMethodCategory>[] = [
    {
      key: 'categoria',
      header: 'Categoría',
      cardLabel: null,
      render: (item) => <strong className="text-[13px] font-medium text-fg">{item.nombre}</strong>,
    },
    {
      key: 'referencia',
      header: 'Referencia',
      render: (item) => (item.requiereReferencia ? 'Obligatoria' : 'Opcional'),
    },
    {
      key: 'metodos',
      header: 'Métodos asociados',
      render: (item) => `${item.metodos} ${item.metodos === 1 ? 'método' : 'métodos'}`,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => (
        <Badge tone={item.estado ? 'green' : 'red'}>{item.estado ? 'Activa' : 'Inactiva'}</Badge>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      cardLabel: null,
      render: (item) => (
        <div className="flex flex-wrap gap-[7px]">
          <IconButton onClick={() => openForm(item)} title="Editar categoría">
            <Pencil size={16} />
          </IconButton>
          <IconButton
            tone="danger"
            onClick={() => void remove(item)}
            disabled={item.metodos > 0}
            title={
              item.metodos > 0
                ? 'No se puede eliminar una categoría con métodos asociados'
                : 'Eliminar categoría'
            }
          >
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
          <h1>Categorías de métodos de pago</h1>
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
        loadingLabel="Cargando categorías de métodos de pago..."
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
        <PaymentMethodCategoryFormModal editando={editing} onClose={close} onSaved={handleSaved} />
      ) : null}
    </div>
  );
}
