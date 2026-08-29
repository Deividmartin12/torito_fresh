'use client';

import { Pencil, Plus, Search, UserCheck, UserX, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pagination } from '../../../components/Pagination';
import { api } from '../../../lib/api';

const CARGOS = ['Administrador', 'Almacenero', 'Vendedor', 'Repartidor'] as const;

type Trabajador = {
  id: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  correo: string;
  cargo: string;
  estado: boolean;
};

type TrabajadorForm = Pick<
  Trabajador,
  'tipoDocumento' | 'numeroDocumento' | 'nombres' | 'apellidos' | 'telefono' | 'correo' | 'cargo'
>;
type FormErrors = Partial<Record<keyof TrabajadorForm, string>>;

const emptyForm: TrabajadorForm = {
  tipoDocumento: 'DNI',
  numeroDocumento: '',
  nombres: '',
  apellidos: '',
  telefono: '',
  correo: '',
  cargo: 'Vendedor',
};

export default function TrabajadoresPage() {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Trabajador | null>(null);
  const [form, setForm] = useState<TrabajadorForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTrabajadores(await api<Trabajador[]>('/trabajadores'));
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar los trabajadores',
        { action: { label: 'Reintentar', onClick: () => void load() } },
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibles = useMemo(() => {
    const term = buscar.trim().toLowerCase();
    return trabajadores.filter((item) => {
      const matchesStatus =
        estado === 'Todos' || (estado === 'Activos' ? item.estado : !item.estado);
      const matchesSearch =
        !term ||
        `${item.nombres} ${item.apellidos} ${item.numeroDocumento} ${item.cargo}`
          .toLowerCase()
          .includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [buscar, estado, trabajadores]);
  const pages = Math.max(1, Math.ceil(visibles.length / pageSize));
  const currentPage = Math.min(pagina, pages);
  const paginados = visibles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function abrir(item?: Trabajador) {
    setEditando(item ?? null);
    setForm(
      item
        ? {
            tipoDocumento: item.tipoDocumento,
            numeroDocumento: item.numeroDocumento,
            nombres: item.nombres,
            apellidos: item.apellidos,
            telefono: item.telefono,
            correo: item.correo,
            cargo: item.cargo,
          }
        : emptyForm,
    );
    setFieldErrors({});
    setModal(true);
  }

  function updateField(field: keyof TrabajadorForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate() {
    const next: FormErrors = {};
    if (!form.numeroDocumento.trim()) next.numeroDocumento = 'Ingresa el numero de documento.';
    if (!form.nombres.trim()) next.nombres = 'Ingresa los nombres.';
    if (!form.apellidos.trim()) next.apellidos = 'Ingresa los apellidos.';
    if (form.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo.trim()))
      next.correo = 'Ingresa un correo valido.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const payload = {
      tipoDocumento: form.tipoDocumento,
      numeroDocumento: form.numeroDocumento.trim(),
      nombres: form.nombres.trim(),
      apellidos: form.apellidos.trim(),
      telefono: form.telefono.trim(),
      correo: form.correo.trim(),
      cargo: form.cargo,
    };
    try {
      const saved = await api<Trabajador>(
        editando ? `/trabajadores/${editando.id}` : '/trabajadores',
        {
          method: editando ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      setTrabajadores((current) =>
        (editando
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved]
        ).sort((left, right) => left.nombres.localeCompare(right.nombres, 'es')),
      );
      toast.success(editando ? 'Trabajador actualizado correctamente.' : 'Trabajador registrado correctamente.');
      setModal(false);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar el trabajador',
      );
    } finally {
      setSaving(false);
    }
  }

  async function cambiarEstado(item: Trabajador) {
    if (item.estado && !window.confirm(`¿Desactivar a ${item.nombres} ${item.apellidos}?`)) return;
    setProcessingId(item.id);
    try {
      const updated = await api<Trabajador>(`/trabajadores/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: !item.estado }),
      });
      setTrabajadores((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cambiar el estado del trabajador',
        { action: { label: 'Reintentar', onClick: () => void load() } },
      );
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Trabajadores</h1>
          <span>{trabajadores.length} trabajadores</span>
        </div>
        <button
          type="button"
          className="round-add"
          onClick={() => abrir()}
          title="Agregar trabajador"
          aria-label="Agregar trabajador"
          disabled={loading}
        >
          <Plus size={20} />
        </button>
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
            placeholder="Buscar por nombre, documento o cargo"
          />
        </label>
        <select
          className="filter-pill"
          value={estado}
          onChange={(event) => {
            setEstado(event.target.value);
            setPagina(1);
          }}
          aria-label="Filtrar por estado"
        >
          <option>Todos</option>
          <option>Activos</option>
          <option>Inactivos</option>
        </select>
      </div>
      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando trabajadores...
        </div>
      ) : (
        <>
          <div className="glass-table">
            <table>
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th>Cargo</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginados.length ? (
                  paginados.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>
                          {item.nombres} {item.apellidos}
                        </strong>
                        <small>
                          {item.tipoDocumento} {item.numeroDocumento}
                        </small>
                      </td>
                      <td>{item.cargo}</td>
                      <td>
                        {item.telefono || 'Sin telefono'}
                        <small>{item.correo || 'Sin correo'}</small>
                      </td>
                      <td>
                        <span className={item.estado ? 'status status-green' : 'status status-red'}>
                          {item.estado ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-soft"
                            onClick={() => abrir(item)}
                            title="Editar trabajador"
                            aria-label={`Editar ${item.nombres}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-soft"
                            onClick={() => void cambiarEstado(item)}
                            disabled={processingId === item.id}
                            title={item.estado ? 'Desactivar trabajador' : 'Activar trabajador'}
                            aria-label={`${item.estado ? 'Desactivar' : 'Activar'} ${item.nombres}`}
                          >
                            {item.estado ? <UserX size={16} /> : <UserCheck size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="table-empty">
                        <Search size={22} />
                        <span>No hay trabajadores que coincidan con los filtros.</span>
                        {buscar || estado !== 'Todos' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setBuscar('');
                              setEstado('Todos');
                            }}
                          >
                            Limpiar filtros
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={currentPage}
            pages={pages}
            total={visibles.length}
            pageSize={pageSize}
            onChange={setPagina}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPagina(1);
            }}
          />
        </>
      )}
      {modal ? (
        <div className="modal-backdrop">
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="worker-modal-title"
          >
            <div className="modal-top">
              <h2 id="worker-modal-title">
                {editando ? 'Editar trabajador' : 'Agregar trabajador'}
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModal(false)}
                aria-label="Cerrar modal"
                disabled={saving}
              >
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={guardar} noValidate>
              <label>
                <span>Tipo de documento</span>
                <select
                  value={form.tipoDocumento}
                  onChange={(event) => updateField('tipoDocumento', event.target.value)}
                >
                  <option>DNI</option>
                  <option>CE</option>
                </select>
              </label>
              <label>
                <span>Numero de documento</span>
                <input
                  value={form.numeroDocumento}
                  onChange={(event) => updateField('numeroDocumento', event.target.value)}
                  maxLength={20}
                  required
                  autoFocus
                />
                {fieldErrors.numeroDocumento ? (
                  <small className="field-error">{fieldErrors.numeroDocumento}</small>
                ) : null}
              </label>
              <label>
                <span>Nombres</span>
                <input
                  value={form.nombres}
                  onChange={(event) => updateField('nombres', event.target.value)}
                  maxLength={100}
                  required
                />
                {fieldErrors.nombres ? (
                  <small className="field-error">{fieldErrors.nombres}</small>
                ) : null}
              </label>
              <label>
                <span>Apellidos</span>
                <input
                  value={form.apellidos}
                  onChange={(event) => updateField('apellidos', event.target.value)}
                  maxLength={100}
                  required
                />
                {fieldErrors.apellidos ? (
                  <small className="field-error">{fieldErrors.apellidos}</small>
                ) : null}
              </label>
              <label>
                <span>Cargo</span>
                <select value={form.cargo} onChange={(event) => updateField('cargo', event.target.value)}>
                  {CARGOS.map((cargo) => (
                    <option key={cargo}>{cargo}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Telefono</span>
                <input
                  value={form.telefono}
                  onChange={(event) => updateField('telefono', event.target.value)}
                  inputMode="tel"
                  maxLength={20}
                />
              </label>
              <label>
                <span>Correo</span>
                <input
                  type="email"
                  value={form.correo}
                  onChange={(event) => updateField('correo', event.target.value)}
                  maxLength={150}
                />
                {fieldErrors.correo ? (
                  <small className="field-error">{fieldErrors.correo}</small>
                ) : null}
              </label>
              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setModal(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button className="btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar trabajador'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
