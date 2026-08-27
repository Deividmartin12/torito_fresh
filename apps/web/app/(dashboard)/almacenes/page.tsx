'use client';

import { Boxes, Pencil, Plus, Search, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';

type Almacen = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  direccion: string;
  responsable: string;
  productos: number;
  unidades: number;
  activo: boolean;
};

export default function AlmacenesPage() {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [buscar, setBuscar] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Almacen | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    api<Almacen[]>('/operations/warehouses')
      .then(setAlmacenes)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los almacenes'),
      );
  }, []);
  const visibles = useMemo(
    () =>
      almacenes.filter((item) =>
        `${item.codigo} ${item.nombre} ${item.responsable}`
          .toLowerCase()
          .includes(buscar.toLowerCase()),
      ),
    [almacenes, buscar],
  );
  function abrir(item?: Almacen) {
    setEditando(item ?? null);
    setModal(true);
  }
  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (editando) {
      setModal(false);
      return;
    }
    const values = new FormData(event.currentTarget as HTMLFormElement);
    setError('');
    setGuardando(true);
    try {
      await api('/operations/warehouses', {
        method: 'POST',
        body: JSON.stringify({
          codigo: values.get('codigo'),
          nombre: values.get('nombre'),
          tipo: values.get('tipo'),
          direccion: values.get('direccion'),
        }),
      });
      setAlmacenes(await api<Almacen[]>('/operations/warehouses'));
      setModal(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el almacén');
    } finally {
      setGuardando(false);
    }
  }
  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Almacenes</h1>
          <span>{almacenes.length} almacenes</span>
        </div>
        <button
          className="round-add"
          onClick={() => abrir()}
          title="Agregar almacen"
          aria-label="Agregar almacen"
        >
          <Plus size={20} />
        </button>
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar por codigo, nombre o responsable"
          />
        </label>
      </div>
      {error ? (
        <div className="notice-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="glass-table">
        <table>
          <thead>
            <tr>
              <th>Almacen</th>
              <th>Tipo</th>
              <th>Direccion</th>
              <th>Responsable</th>
              <th>Productos</th>
              <th>Unidades</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.nombre}</strong>
                  <small>{item.codigo}</small>
                </td>
                <td>{item.tipo}</td>
                <td>{item.direccion}</td>
                <td>{item.responsable}</td>
                <td>{item.productos}</td>
                <td>{item.unidades}</td>
                <td>
                  <span className="status status-green">Activo</span>
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      className="icon-soft"
                      onClick={() => abrir(item)}
                      title="Editar almacen"
                    >
                      <Pencil size={16} />
                    </button>
                    <button className="icon-soft" title="Ver stock">
                      <Boxes size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal ? (
        <div className="modal-backdrop">
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editando ? 'Editar almacen' : 'Agregar almacen'}
          >
            <div className="modal-top">
              <h2>{editando ? 'Editar almacen' : 'Agregar almacen'}</h2>
              <button
                className="modal-close"
                onClick={() => setModal(false)}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={guardar}>
              <label>
                <span>Codigo</span>
                <input name="codigo" defaultValue={editando?.codigo} required />
              </label>
              <label>
                <span>Nombre</span>
                <input name="nombre" defaultValue={editando?.nombre} required />
              </label>
              <label>
                <span>Tipo</span>
                <select name="tipo" defaultValue={editando?.tipo ?? 'PRINCIPAL'}>
                  <option>PRINCIPAL</option>
                  <option>SECUNDARIO</option>
                  <option>MATERIA_PRIMA</option>
                  <option>PRODUCTO_TERMINADO</option>
                  <option>ENVASES</option>
                  <option>VEHICULO</option>
                  <option>PLANTA</option>
                </select>
              </label>
              <label className="field-wide">
                <span>Direccion</span>
                <input name="direccion" defaultValue={editando?.direccion} />
              </label>
              <div className="modal-actions">
                <button className="btn-secondary" type="button" onClick={() => setModal(false)}>
                  Cancelar
                </button>
                <button className="btn-primary" disabled={guardando}>
                  {guardando
                    ? 'Registrando...'
                    : editando
                      ? 'Guardar cambios'
                      : 'Registrar almacen'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
