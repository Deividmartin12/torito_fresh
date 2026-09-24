'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, Pencil, Search, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { PaymentMethodFormModal } from '../../../components/PaymentMethodFormModal';
import { AddButton } from '../../../components/ui/AddButton';
import { Badge } from '../../../components/ui/Badge';
import { IconButton } from '../../../components/ui/IconButton';
import { api } from '../../../lib/api';
import { getPaymentMethods, PaymentMethod } from '../../../lib/payment-methods';

type TrabajadorOption = { id: string; nombre: string };

function MethodIcon({ name }: { name: string }) {
  const normalized = name.toUpperCase();
  const Icon = normalized.includes('EFECTIVO')
    ? Banknote
    : normalized.includes('YAPE') || normalized.includes('PLIN')
      ? Smartphone
      : CreditCard;
  return <Icon size={18} />;
}

export default function MetodosPagoPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);

  const query = useQuery({ queryKey: ['payment-methods'], queryFn: getPaymentMethods });
  const methods = query.data ?? [];
  const loading = query.isPending;
  const load = query.refetch;
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error
          ? query.error.message
          : 'No se pudieron cargar los métodos de pago',
        { action: { label: 'Reintentar', onClick: () => void query.refetch() } },
      );
    }
  }, [query.error, query.refetch]);

  const trabajadoresQuery = useQuery({
    queryKey: ['trabajadores', 'todos'],
    queryFn: () =>
      api<{ id: string; nombres: string; apellidos: string; estado: boolean }[]>('/trabajadores'),
    retry: false,
  });
  const trabajadores: TrabajadorOption[] = useMemo(
    () =>
      (trabajadoresQuery.data ?? [])
        .filter((row) => row.estado)
        .map((row) => ({ id: row.id, nombre: `${row.nombres} ${row.apellidos}` })),
    [trabajadoresQuery.data],
  );

  const visible = useMemo(() => {
    const term = search.toLowerCase();
    return methods.filter(
      (item) =>
        item.nombre.toLowerCase().includes(term) ||
        (item.categoria ?? '').toLowerCase().includes(term),
    );
  }, [methods, search]);
  function close() {
    setOpen(false);
    setEditing(null);
  }
  function openForm(method?: PaymentMethod) {
    setEditing(method ?? null);
    setOpen(true);
  }
  function handleSaved(saved: PaymentMethod) {
    queryClient.setQueryData<PaymentMethod[]>(['payment-methods'], (current) =>
      current?.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...(current ?? []), saved].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    );
    close();
  }

  const columns: DataTableColumn<PaymentMethod>[] = [
    {
      key: 'metodo',
      header: 'Método',
      cardLabel: null,
      render: (item) => (
        <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <MethodIcon name={item.categoria ?? item.nombre} />
          <strong className="font-medium">{item.nombre}</strong>
        </div>
      ),
    },
    { key: 'tipo', header: 'Tipo', render: (item) => item.categoria ?? '—' },
    { key: 'dueno', header: 'Dueño', render: (item) => item.trabajador ?? 'Todos' },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => (
        <Badge tone={item.estado ? 'green' : 'red'}>{item.estado ? 'Activo' : 'Inactivo'}</Badge>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      cardLabel: null,
      render: (item) => (
        <IconButton onClick={() => openForm(item)} title="Editar método">
          <Pencil size={16} />
        </IconButton>
      ),
    },
  ];

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Métodos de pago</h1>
          <span>{methods.length} métodos registrados</span>
        </div>
        <AddButton label="Agregar método" onClick={() => openForm()} />
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar método de pago"
          />
        </label>
      </div>
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(item) => item.id}
        loading={loading}
        loadingLabel="Cargando métodos de pago..."
        emptyMessage={
          <div className="flex flex-col items-center gap-2.5">
            <span>No hay métodos de pago que coincidan.</span>
            <button type="button" className="text-accent underline" onClick={() => setSearch('')}>
              Limpiar búsqueda
            </button>
          </div>
        }
      />
      {open ? (
        <PaymentMethodFormModal
          editando={editing}
          trabajadores={trabajadores}
          onClose={close}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
