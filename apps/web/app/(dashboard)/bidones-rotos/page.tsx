'use client';

import { Droplets, Plus, Search, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BidonRoto,
  CreateBidonRotoPayload,
  createBidonRoto,
  getBidonesRotos,
} from '../../../lib/bidones-rotos';

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
  const [registros, setRegistros] = useState<BidonRoto[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<CreateBidonRotoPayload>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRegistros(await getBidonesRotos());
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar los registros', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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
      setRegistros((current) => [creado, ...current]);
      toast.success('Rotura registrada.');
      closeForm();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar la rotura', {
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
          <span className="operation-eyebrow">Distribución</span>
          <h1>Bidones rotos</h1>
          <p>Registra cuántos bidones se rompen cada día y revisa el total por período.</p>
        </div>
        <button
          className="btn-primary operation-primary-action"
          type="button"
          onClick={() => setOpen(true)}
        >
          <Plus size={18} /> Registrar rotura
        </button>
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
          <button className="btn-primary" type="button" onClick={() => setOpen(true)}>
            <Plus size={17} /> Registrar rotura
          </button>
        </div>
      ) : (
        <div className="glass-table">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cantidad</th>
                <th>Observación</th>
                <th>Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length ? (
                visibles.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(`${dia(item.fecha)}T00:00:00`).toLocaleDateString('es-PE')}</td>
                    <td>
                      <strong>{item.cantidad}</strong>
                    </td>
                    <td>{item.observaciones || '—'}</td>
                    <td>{item.registradoPor || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <div className="table-empty">
                      <Search size={22} />
                      <span>No hay registros que coincidan con la búsqueda.</span>
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
        <div className="modal-backdrop">
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Registrar rotura"
          >
            <div className="modal-top">
              <div>
                <h2>Registrar bidones rotos</h2>
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
                <span>Cantidad</span>
                <input
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
                <span>Observación (opcional)</span>
                <textarea
                  maxLength={300}
                  value={form.observaciones}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, observaciones: event.target.value }))
                  }
                  placeholder="Ej. se cayeron del camión durante el reparto"
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
                <button className="btn-primary" disabled={saving}>
                  {saving ? 'Registrando...' : 'Registrar rotura'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
