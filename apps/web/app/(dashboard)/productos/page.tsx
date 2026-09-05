'use client';

import { Boxes, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pagination } from '../../../components/Pagination';
import { api } from '../../../lib/api';
import { puedeEditar } from '../../../lib/permissions';
import { useRole } from '../../../lib/useCurrentUser';

type Producto = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  unidad: string;
  capacidad: string;
  precio: number;
  costo: number;
  stock: number;
  lote: boolean;
  retornable: boolean;
  activo: boolean;
  tieneVentas: boolean;
};

export default function ProductosPage() {
  const [datos, setDatos] = useState<Producto[]>([]);
  const [tiposProducto, setTiposProducto] = useState<{ id: string; nombre: string }[]>([]);
  const [buscar, setBuscar] = useState('');
  const [tipo, setTipo] = useState('Todos');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const editable = puedeEditar(useRole());
  useEffect(() => {
    api<Producto[]>('/operations/products')
      .then(setDatos)
      .catch((cause) =>
        toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar los productos'),
      );
    api<{ id: string; nombre: string }[]>('/operations/product-types')
      .then(setTiposProducto)
      .catch(() => undefined);
  }, []);
  const tipos = useMemo(
    () => [...new Set(datos.map((item) => item.tipo))].sort((a, b) => a.localeCompare(b)),
    [datos],
  );
  const productos = useMemo(
    () =>
      datos.filter(
        (item) =>
          (tipo === 'Todos' || item.tipo === tipo) &&
          `${item.codigo} ${item.nombre}`.toLowerCase().includes(buscar.toLowerCase()),
      ),
    [buscar, datos, tipo],
  );
  const paginados = productos.slice((pagina - 1) * pageSize, pagina * pageSize);
  function abrir(item?: Producto) {
    setEditando(item ?? null);
    setModal(true);
  }
  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (editando) {
      setModal(false);
      return;
    }
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    setGuardando(true);
    try {
      await api('/operations/products', {
        method: 'POST',
        body: JSON.stringify({
          nombre: values.get('nombre'),
          tipo: values.get('tipo'),
          unidad: values.get('unidad'),
          precio: Number(values.get('precio')),
          costo: Number(values.get('costo')),
          controlaLote: values.has('lote'),
          esRetornable: values.has('retornable'),
        }),
      });
      setDatos(await api<Producto[]>('/operations/products'));
      api<{ id: string; nombre: string }[]>('/operations/product-types')
        .then(setTiposProducto)
        .catch(() => undefined);
      setModal(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar el producto');
    } finally {
      setGuardando(false);
    }
  }
  async function eliminar(item: Producto) {
    if (
      item.tieneVentas ||
      !window.confirm(`¿Eliminar ${item.nombre}? Esta acción no se puede deshacer.`)
    )
      return;
    try {
      await api(`/operations/products/${item.id}`, { method: 'DELETE' });
      setDatos((current) => current.filter((product) => product.id !== item.id));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo eliminar el producto');
    }
  }
  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Productos</h1>
          <span>{datos.length} productos</span>
        </div>
        {editable ? (
          <button
            className="round-add"
            onClick={() => abrir()}
            title="Agregar producto"
            aria-label="Agregar producto"
          >
            <Plus size={20} />
          </button>
        ) : null}
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
            placeholder="Buscar por código o nombre"
          />
        </label>
        <select
          className="filter-pill"
          value={tipo}
          onChange={(event) => {
            setTipo(event.target.value);
            setPagina(1);
          }}
        >
          <option>Todos</option>
          {tipos.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <div className="glass-table">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Unidad</th>
              <th>Precio venta</th>
              <th>Costo ref.</th>
              <th>Stock global</th>
              <th>Control</th>
              <th>Estado</th>
              {editable ? <th>Acciones</th> : null}
            </tr>
          </thead>
          <tbody>
            {paginados.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.nombre}</strong>
                  <small>
                    {item.codigo} · {item.capacidad}
                  </small>
                </td>
                <td>{item.tipo}</td>
                <td>{item.unidad}</td>
                <td>S/ {item.precio.toFixed(2)}</td>
                <td>S/ {item.costo.toFixed(2)}</td>
                <td>{item.stock}</td>
                <td>{item.lote ? 'Lote' : item.retornable ? 'Retornable' : 'Simple'}</td>
                <td>
                  <span className={`status ${item.activo ? 'status-green' : 'status-amber'}`}>
                    {item.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                {editable ? (
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-soft"
                        onClick={() => abrir(item)}
                        title="Editar producto"
                      >
                        <Pencil size={16} />
                      </button>
                      <button className="icon-soft" title="Ver stock">
                        <Boxes size={16} />
                      </button>
                      <button
                        className="icon-soft"
                        onClick={() => void eliminar(item)}
                        title={
                          item.tieneVentas
                            ? 'No se puede eliminar: está ligado a una venta'
                            : 'Eliminar producto'
                        }
                        aria-label={`Eliminar ${item.nombre}`}
                        disabled={item.tieneVentas}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={pagina}
        pages={Math.max(1, Math.ceil(productos.length / pageSize))}
        total={productos.length}
        pageSize={pageSize}
        onChange={setPagina}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPagina(1);
        }}
      />
      {modal ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !guardando) setModal(false);
          }}
        >
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editando ? 'Editar producto' : 'Agregar producto'}
          >
            <div className="modal-top">
              <h2>{editando ? 'Editar producto' : 'Agregar producto'}</h2>
              <button
                className="modal-close"
                onClick={() => setModal(false)}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={guardar}>
              {editando ? (
                <label>
                  <span>Código</span>
                  <input value={editando.codigo} disabled />
                </label>
              ) : null}
              <label>
                <span>Nombre</span>
                <input name="nombre" defaultValue={editando?.nombre} required />
              </label>
              <label>
                <span>Tipo de producto</span>
                <input
                  name="tipo"
                  list="tipos-producto-options"
                  defaultValue={editando?.tipo}
                  placeholder="Ej. Agua, Bidón, Insumo..."
                  required
                />
                <datalist id="tipos-producto-options">
                  {tiposProducto.map((item) => (
                    <option value={item.nombre} key={item.id} />
                  ))}
                </datalist>
              </label>
              <label>
                <span>Unidad de medida</span>
                <select name="unidad" defaultValue={editando?.unidad ?? 'Unidad'}>
                  <option>Unidad</option>
                  <option>Litro</option>
                  <option>Caja</option>
                </select>
              </label>
              <label>
                <span>Precio de venta</span>
                <input
                  name="precio"
                  type="number"
                  step="0.01"
                  defaultValue={editando?.precio}
                  required
                />
              </label>
              <label>
                <span>Costo de referencia</span>
                <input
                  name="costo"
                  type="number"
                  step="0.01"
                  defaultValue={editando?.costo}
                  required
                />
              </label>
              <label className="check-field">
                <input name="lote" type="checkbox" defaultChecked={editando?.lote} />
                <span>Controla lote</span>
              </label>
              <label className="check-field">
                <input name="retornable" type="checkbox" defaultChecked={editando?.retornable} />
                <span>Es retornable</span>
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
                      : 'Registrar producto'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
