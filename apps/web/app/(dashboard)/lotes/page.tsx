'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Search } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import {
  controlClass,
  fieldLabelClass,
  modalActionsClass,
  modalFormClass,
} from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { Modal, ModalHeader } from '../../../components/ui/Modal';
import { api } from '../../../lib/api';
import { fechaCorta } from '../../../lib/format';

const ESTADOS_LOTE = ['ACTIVO', 'VENCIDO', 'AGOTADO', 'BLOQUEADO'] as const;
type EstadoLote = (typeof ESTADOS_LOTE)[number];

type Lote = {
  id: string;
  codigo: string;
  producto: string;
  fechaProduccion: string | null;
  fechaVencimiento: string | null;
  costo: number;
  disponible: number;
  estado: EstadoLote;
};

/** De `"2026-01-15T00:00:00.000Z"` (o null) al valor `YYYY-MM-DD` que espera un input date. */
const soloFecha = (valor: string | null) => (valor ? valor.slice(0, 10) : '');

export default function LotesPage() {
  const queryClient = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [editando, setEditando] = useState<Lote | null>(null);
  const [form, setForm] = useState({ fechaProduccion: '', fechaVencimiento: '', estado: 'ACTIVO' });
  const [guardando, setGuardando] = useState(false);

  const query = useQuery({ queryKey: ['lots'], queryFn: () => api<Lote[]>('/operations/lots') });
  const datos = query.data ?? [];
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error ? query.error.message : 'No se pudieron cargar los lotes',
      );
    }
  }, [query.error]);
  const lotes = useMemo(
    () =>
      datos.filter(
        (item) =>
          (estado === 'Todos' || item.estado === estado) &&
          `${item.codigo} ${item.producto}`.toLowerCase().includes(buscar.toLowerCase()),
      ),
    [buscar, datos, estado],
  );

  function abrir(item: Lote) {
    setEditando(item);
    setForm({
      fechaProduccion: soloFecha(item.fechaProduccion),
      fechaVencimiento: soloFecha(item.fechaVencimiento),
      estado: item.estado,
    });
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editando) return;
    if (
      form.fechaProduccion &&
      form.fechaVencimiento &&
      form.fechaVencimiento < form.fechaProduccion
    ) {
      toast.error('La fecha de vencimiento no puede ser anterior a la de producción.');
      return;
    }
    setGuardando(true);
    try {
      const actualizado = await api<Lote>(`/operations/lots/${editando.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fechaProduccion: form.fechaProduccion || null,
          fechaVencimiento: form.fechaVencimiento || null,
          estado: form.estado,
        }),
      });
      queryClient.setQueryData<Lote[]>(['lots'], (current) =>
        current?.map((item) => (item.id === actualizado.id ? actualizado : item)),
      );
      toast.success('Lote actualizado.');
      setEditando(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo actualizar el lote');
    } finally {
      setGuardando(false);
    }
  }

  const columns: DataTableColumn<Lote>[] = [
    {
      key: 'lote',
      header: 'Lote',
      cardLabel: null,
      render: (item) => (
        <strong className="block text-[13px] font-medium text-fg">{item.codigo}</strong>
      ),
    },
    { key: 'producto', header: 'Producto', render: (item) => item.producto },
    {
      key: 'produccion',
      header: 'Producción',
      render: (item) => fechaCorta(item.fechaProduccion),
    },
    {
      key: 'vencimiento',
      header: 'Vencimiento',
      render: (item) => fechaCorta(item.fechaVencimiento),
    },
    {
      key: 'costo',
      header: 'Costo unitario',
      render: (item) => `S/ ${item.costo.toFixed(4)}`,
    },
    { key: 'disponible', header: 'Disponible', render: (item) => item.disponible },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => (
        <Badge tone={item.estado === 'ACTIVO' ? 'green' : 'red'}>{item.estado}</Badge>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      cardLabel: null,
      render: (item) => (
        <div className="flex flex-wrap gap-[7px]">
          <IconButton
            onClick={() => abrir(item)}
            title="Editar lote"
            aria-label={`Editar lote ${item.codigo}`}
          >
            <Pencil size={16} />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Lotes</h1>
          <span>{datos.length} lotes</span>
        </div>
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar por lote o producto"
          />
        </label>
        <select
          className="filter-pill"
          value={estado}
          onChange={(event) => setEstado(event.target.value)}
        >
          <option>Todos</option>
          {ESTADOS_LOTE.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <DataTable
        columns={columns}
        rows={lotes}
        rowKey={(item) => item.id}
        emptyMessage={
          <>
            <CalendarClock size={22} />
            <span>Aún no hay lotes. Se generan automáticamente al registrar producción.</span>
          </>
        }
      />
      {editando ? (
        <Modal onClose={() => setEditando(null)} closeDisabled={guardando}>
          <ModalHeader
            title={`Editar lote ${editando.codigo}`}
            onClose={() => setEditando(null)}
            closeDisabled={guardando}
          />
          <form className={modalFormClass} onSubmit={guardar} noValidate>
            <label>
              <span className={fieldLabelClass}>Producto</span>
              <input className={controlClass} value={editando.producto} disabled />
            </label>
            <label>
              <span className={fieldLabelClass}>Costo unitario</span>
              <input className={controlClass} value={`S/ ${editando.costo.toFixed(4)}`} disabled />
            </label>
            <label>
              <span className={fieldLabelClass}>Fecha de producción</span>
              <input
                className={controlClass}
                type="date"
                value={form.fechaProduccion}
                onChange={(event) =>
                  setForm((current) => ({ ...current, fechaProduccion: event.target.value }))
                }
              />
            </label>
            <label>
              <span className={fieldLabelClass}>Fecha de vencimiento</span>
              <input
                className={controlClass}
                type="date"
                value={form.fechaVencimiento}
                min={form.fechaProduccion || undefined}
                onChange={(event) =>
                  setForm((current) => ({ ...current, fechaVencimiento: event.target.value }))
                }
              />
            </label>
            <label>
              <span className={fieldLabelClass}>Estado</span>
              <select
                className={controlClass}
                value={form.estado}
                onChange={(event) =>
                  setForm((current) => ({ ...current, estado: event.target.value }))
                }
              >
                {ESTADOS_LOTE.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <div className={modalActionsClass}>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setEditando(null)}
                disabled={guardando}
              >
                Cancelar
              </Button>
              <Button disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
