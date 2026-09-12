'use client';

import { Banknote, CreditCard, Pencil, Plus, Search, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PaymentMethodFormModal } from '../../../components/PaymentMethodFormModal';
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
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [trabajadores, setTrabajadores] = useState<TrabajadorOption[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMethods(await getPaymentMethods());
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : 'No se pudieron cargar los métodos de pago',
        { action: { label: 'Reintentar', onClick: () => void load() } },
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    api<{ id: string; nombres: string; apellidos: string; estado: boolean }[]>('/trabajadores')
      .then((rows) =>
        setTrabajadores(
          rows
            .filter((row) => row.estado)
            .map((row) => ({ id: row.id, nombre: `${row.nombres} ${row.apellidos}` })),
        ),
      )
      .catch(() => undefined);
  }, []);

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
    setMethods((current) =>
      current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    );
    close();
  }

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Métodos de pago</h1>
          <span>{methods.length} métodos registrados</span>
        </div>
        <button
          className="round-add"
          type="button"
          onClick={() => openForm()}
          title="Agregar método"
          aria-label="Agregar método"
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
            placeholder="Buscar método de pago"
          />
        </label>
      </div>
      {loading ? (
        <div className="table-loading">
          <span className="loading-spinner" /> Cargando métodos de pago...
        </div>
      ) : (
        <div className="glass-table">
          <table>
            <thead>
              <tr>
                <th>Método</th>
                <th>Tipo</th>
                <th>Dueño</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <MethodIcon name={item.categoria ?? item.nombre} />
                        <strong>{item.nombre}</strong>
                      </div>
                    </td>
                    <td>{item.categoria ?? '—'}</td>
                    <td>{item.trabajador ?? 'Todos'}</td>
                    <td>
                      <span className={`status ${item.estado ? 'status-green' : 'status-red'}`}>
                        {item.estado ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-soft"
                        type="button"
                        onClick={() => openForm(item)}
                        title="Editar método"
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <div className="table-empty">
                      No hay métodos de pago que coincidan.
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
