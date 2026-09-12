'use client';

import { CalendarClock, Pencil, Search, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pagination } from '../../../components/Pagination';
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
  const [datos, setDatos] = useState<Lote[]>([]);
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editando, setEditando] = useState<Lote | null>(null);
  const [form, setForm] = useState({ fechaProduccion: '', fechaVencimiento: '', estado: 'ACTIVO' });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<Lote[]>('/operations/lots')
      .then(setDatos)
      .catch((cause) =>
        toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar los lotes'),
      );
  }, []);
  const lotes = useMemo(
    () =>
      datos.filter(
        (item) =>
          (estado === 'Todos' || item.estado === estado) &&
          `${item.codigo} ${item.producto}`.toLowerCase().includes(buscar.toLowerCase()),
      ),
    [buscar, datos, estado],
  );
  const paginados = lotes.slice((pagina - 1) * pageSize, pagina * pageSize);

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
      setDatos((current) =>
        current.map((item) => (item.id === actualizado.id ? actualizado : item)),
      );
      toast.success('Lote actualizado.');
      setEditando(null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo actualizar el lote');
    } finally {
      setGuardando(false);
    }
  }

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
            onChange={(event) => {
              setBuscar(event.target.value);
              setPagina(1);
            }}
            placeholder="Buscar por lote o producto"
          />
        </label>
        <select
          className="filter-pill"
          value={estado}
          onChange={(event) => {
            setEstado(event.target.value);
            setPagina(1);
          }}
        >
          <option>Todos</option>
          {ESTADOS_LOTE.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <div className="glass-table">
        <table>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Producto</th>
              <th>Producción</th>
              <th>Vencimiento</th>
              <th>Costo unitario</th>
              <th>Disponible</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginados.length ? (
              paginados.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.codigo}</strong>
                  </td>
                  <td>{item.producto}</td>
                  <td>{fechaCorta(item.fechaProduccion)}</td>
                  <td>{fechaCorta(item.fechaVencimiento)}</td>
                  <td>S/ {item.costo.toFixed(4)}</td>
                  <td>{item.disponible}</td>
                  <td>
                    <span
                      className={
                        item.estado === 'ACTIVO' ? 'status status-green' : 'status status-red'
                      }
                    >
                      {item.estado}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-soft"
                        onClick={() => abrir(item)}
                        title="Editar lote"
                        aria-label={`Editar lote ${item.codigo}`}
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>
                  <div className="table-empty">
                    <CalendarClock size={22} />
                    <span>
                      Aún no hay lotes. Se generan automáticamente al registrar producción.
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={pagina}
        pages={Math.max(1, Math.ceil(lotes.length / pageSize))}
        total={lotes.length}
        pageSize={pageSize}
        onChange={setPagina}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPagina(1);
        }}
      />
      {editando ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !guardando) setEditando(null);
          }}
        >
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Editar lote ${editando.codigo}`}
          >
            <div className="modal-top">
              <h2>Editar lote {editando.codigo}</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setEditando(null)}
                disabled={guardando}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={guardar} noValidate>
              <label>
                <span>Producto</span>
                <input value={editando.producto} disabled />
              </label>
              <label>
                <span>Costo unitario</span>
                <input value={`S/ ${editando.costo.toFixed(4)}`} disabled />
              </label>
              <label>
                <span>Fecha de producción</span>
                <input
                  type="date"
                  value={form.fechaProduccion}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fechaProduccion: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Fecha de vencimiento</span>
                <input
                  type="date"
                  value={form.fechaVencimiento}
                  min={form.fechaProduccion || undefined}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fechaVencimiento: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Estado</span>
                <select
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
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditando(null)}
                  disabled={guardando}
                >
                  Cancelar
                </button>
                <button className="btn-primary" disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
