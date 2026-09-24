'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Droplets, Plus, Search } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BidonRoto,
  CreateBidonRotoPayload,
  createBidonRoto,
  getBidonesRotos,
} from '../../../lib/bidones-rotos';
import { fechaCorta } from '../../../lib/format';
import { getOperationCatalogs } from '../../../lib/operations';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import {
  controlClass,
  fieldLabelClass,
  modalActionsClass,
  modalFormClass,
  textareaClass,
} from '../../../components/ui/Field';
import { Modal, ModalHeader } from '../../../components/ui/Modal';

const localDate = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const emptyForm = (): CreateBidonRotoPayload => ({
  fecha: localDate(),
  cantidad: 1,
  observaciones: '',
});

// La fecha llega como ISO (columna solo-fecha); comparamos por los primeros 10 caracteres.
const dia = (fecha: string) => fecha.slice(0, 10);

export default function BidonesRotosPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateBidonRotoPayload>(emptyForm);

  const query = useQuery({ queryKey: ['bidones-rotos'], queryFn: () => getBidonesRotos() });
  const registros = query.data ?? [];
  const loading = query.isPending;
  const load = query.refetch;
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error ? query.error.message : 'No se pudieron cargar los registros',
        { action: { label: 'Reintentar', onClick: () => void query.refetch() } },
      );
    }
  }, [query.error, query.refetch]);

  // Catálogos para poder descontar la rotura del inventario. Fallan en silencio: sin ellos la
  // rotura se sigue registrando, que es lo que esta pantalla siempre supo hacer.
  const catalogosQuery = useQuery({
    queryKey: ['operation-catalogs'],
    queryFn: getOperationCatalogs,
    retry: false,
  });
  const productos = catalogosQuery.data?.productos ?? [];
  const almacenes = catalogosQuery.data?.almacenes ?? [];

  // Se cargan todos los registros (más nuevos primero, orden del servidor); aquí solo
  // se refina por texto y se calculan los totales por período.
  const visibles = useMemo(
    () =>
      registros.filter((item) =>
        `${item.observaciones ?? ''} ${item.registradoPor ?? ''}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [registros, search],
  );

  const hoy = localDate();
  const hace7Dias = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const mesActual = hoy.slice(0, 7);
  const sumaCantidad = (lista: BidonRoto[]) =>
    lista.reduce((suma, item) => suma + item.cantidad, 0);
  const totalHoy = sumaCantidad(registros.filter((item) => dia(item.fecha) === hoy));
  const totalSemana = sumaCantidad(registros.filter((item) => dia(item.fecha) >= hace7Dias));
  const totalMes = sumaCantidad(registros.filter((item) => dia(item.fecha).startsWith(mesActual)));

  function closeForm() {
    setOpen(false);
    setForm(emptyForm());
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const creado = await createBidonRoto(form);
      queryClient.setQueryData<BidonRoto[]>(['bidones-rotos'], (current) => [
        creado,
        ...(current ?? []),
      ]);
      // El aviso llega cuando la rotura se anotó pero el inventario no se pudo mover: no hay
      // stock en el almacén, o la unidad no lleva inventario.
      if (creado.aviso) toast.warning(creado.aviso, { duration: 9_000 });
      else if (creado.descontado)
        toast.success(`Rotura registrada y descontada de ${creado.almacen}.`);
      else toast.success('Rotura registrada.');
      closeForm();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar la rotura', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<BidonRoto>[] = [
    { key: 'fecha', header: 'Fecha', render: (item) => fechaCorta(item.fecha) },
    {
      key: 'cantidad',
      header: 'Cantidad',
      render: (item) => (
        <strong className="text-[13px] font-medium text-fg">{item.cantidad}</strong>
      ),
    },
    {
      key: 'producto',
      header: 'Producto',
      render: (item) => (
        <>
          {item.producto ?? '—'}
          {item.almacen ? (
            <small className="mt-0.5 block text-[11px] text-muted">{item.almacen}</small>
          ) : null}
        </>
      ),
    },
    {
      key: 'inventario',
      header: 'Inventario',
      render: (item) => (
        <Badge tone={item.descontado ? 'green' : 'gray'}>
          {item.descontado ? 'Descontado' : 'Solo registro'}
        </Badge>
      ),
    },
    { key: 'observacion', header: 'Observación', render: (item) => item.observaciones || '—' },
    { key: 'registrado', header: 'Registrado por', render: (item) => item.registradoPor || '—' },
  ];

  return (
    <div className="module-page operations-list-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Distribución</span>
          <h1>Bidones rotos</h1>
        </div>
        <Button
          className="min-h-[44px] shrink-0 px-[19px]"
          type="button"
          onClick={() => setOpen(true)}
        >
          <Plus size={18} /> Registrar rotura
        </Button>
      </div>
      <div className="summary-row">
        <div className="summary-glass">
          <span>Hoy</span>
          <strong>{totalHoy}</strong>
          <small>Bidones rotos</small>
        </div>
        <div className="summary-glass">
          <span>Últimos 7 días</span>
          <strong>{totalSemana}</strong>
          <small>Bidones rotos</small>
        </div>
        <div className="summary-glass">
          <span>Este mes</span>
          <strong>{totalMes}</strong>
          <small>Bidones rotos</small>
        </div>
        <div className="summary-glass">
          <span>Registros</span>
          <strong>{visibles.length}</strong>
        </div>
      </div>
      <div className="module-tools operations-filters">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por observación o responsable"
          />
        </label>
      </div>
      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando registros...
        </div>
      ) : registros.length === 0 ? (
        <div className="empty-state">
          <Droplets size={34} />
          <h2>Aún no hay roturas registradas</h2>
          <p>Registra la primera rotura para llevar el conteo diario.</p>
          <Button type="button" onClick={() => setOpen(true)}>
            <Plus size={17} /> Registrar rotura
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={visibles}
          rowKey={(item) => item.id}
          emptyMessage={
            <div className="flex flex-col items-center gap-2.5">
              <Search size={22} />
              <span>No hay registros que coincidan con la búsqueda.</span>
              <button type="button" className="text-accent underline" onClick={() => setSearch('')}>
                Limpiar búsqueda
              </button>
            </div>
          }
        />
      )}
      {open ? (
        <Modal onClose={closeForm} closeDisabled={saving}>
          <ModalHeader title="Registrar bidones rotos" onClose={closeForm} closeDisabled={saving} />
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
              <span className={fieldLabelClass}>Cantidad</span>
              <input
                className={controlClass}
                type="number"
                min="1"
                step="1"
                value={form.cantidad || ''}
                onChange={(event) =>
                  setForm((current) => ({ ...current, cantidad: Number(event.target.value) }))
                }
                required
              />
            </label>
            <label>
              <span className={fieldLabelClass}>Producto (opcional)</span>
              <SearchableSelect
                value={form.productoId ?? ''}
                onChange={(value) => setForm((current) => ({ ...current, productoId: value }))}
                options={productos.map((item) => ({
                  value: item.id,
                  label: item.nombre,
                  hint: item.codigo,
                }))}
                placeholder="Buscar producto"
              />
              <small className="auto-note">
                Al elegirlo, la rotura descuenta esa cantidad del almacén y queda en el kardex como
                merma. Si el bidón se rompió fuera del almacén, dejalo vacío y queda solo como
                registro.
              </small>
            </label>
            {form.productoId && almacenes.length > 1 ? (
              <label>
                <span className={fieldLabelClass}>Almacén</span>
                <SearchableSelect
                  value={form.almacenId ?? ''}
                  onChange={(value) => setForm((current) => ({ ...current, almacenId: value }))}
                  options={almacenes.map((item) => ({ value: item.id, label: item.nombre }))}
                  placeholder="Elegí el almacén"
                />
              </label>
            ) : null}
            <label>
              <span className={fieldLabelClass}>Observación (opcional)</span>
              <textarea
                className={textareaClass}
                maxLength={300}
                value={form.observaciones}
                onChange={(event) =>
                  setForm((current) => ({ ...current, observaciones: event.target.value }))
                }
                placeholder="Ej. se cayeron del camión durante el reparto"
              />
            </label>
            <div className={modalActionsClass}>
              <Button variant="secondary" type="button" onClick={closeForm} disabled={saving}>
                Cancelar
              </Button>
              <Button disabled={saving}>{saving ? 'Registrando...' : 'Registrar rotura'}</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
