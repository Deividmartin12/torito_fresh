'use client';

import { Boxes, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pagination } from '../../../components/Pagination';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { TipoProductoCreado, TipoProductoFormModal } from '../../../components/TipoProductoFormModal';
import { api } from '../../../lib/api';
import { puedeEditar } from '../../../lib/permissions';
import { soloTextoNombre, validarMonto, validarNombreLibre } from '../../../lib/validacion';
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
  const [tipoModal, setTipoModal] = useState(false);
  const [tipoNombre, setTipoNombre] = useState('');
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
    setTipoNombre(item?.tipo ?? '');
    setModal(true);
  }
  // Tipo creado desde el combo del formulario: lo sumamos a la lista y lo dejamos elegido.
  function handleTipoCreado(tipo: TipoProductoCreado) {
    setTiposProducto((current) =>
      current.some((item) => item.nombre === tipo.nombre) ? current : [...current, tipo],
    );
    setTipoNombre(tipo.nombre);
    setTipoModal(false);
  }
  async function guardar(event: FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    if (!tipoNombre.trim()) {
      toast.error('Selecciona el tipo de producto.');
      return;
    }
    const nombre = String(values.get('nombre') ?? '').trim();
    const precio = Number(values.get('precio'));
    const costo = Number(values.get('costo'));
    const errorNombre = validarNombreLibre(nombre, 'el nombre del producto');
    const errorPrecio = validarMonto(precio, { etiqueta: 'el precio de venta' });
    const errorCosto = validarMonto(costo, { etiqueta: 'el costo de referencia' });
    if (errorNombre || errorPrecio || errorCosto) {
      toast.error(errorNombre || errorPrecio || errorCosto);
      return;
    }
    const body = {
      nombre,
      tipo: tipoNombre,
      unidad: values.get('unidad'),
      precio,
      costo,
      controlaLote: values.has('lote'),
      esRetornable: values.has('retornable'),
    };
    setGuardando(true);
    try {
      if (editando) {
        await api(`/operations/products/${editando.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await api('/operations/products', { method: 'POST', body: JSON.stringify(body) });
      }
      setDatos(await api<Producto[]>('/operations/products'));
      api<{ id: string; nombre: string }[]>('/operations/product-types')
        .then(setTiposProducto)
        .catch(() => undefined);
      setModal(false);
      toast.success(editando ? 'Producto actualizado' : 'Producto registrado');
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : editando
            ? 'No se pudo actualizar el producto'
            : 'No se pudo registrar el producto',
      );
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
                <input
                  name="nombre"
                  defaultValue={editando?.nombre}
                  maxLength={120}
                  onChange={(event) => {
                    event.target.value = soloTextoNombre(event.target.value);
                  }}
                  required
                />
              </label>
              <label>
                <span>Tipo de producto</span>
                <SearchableSelect
                  value={tipoNombre}
                  onChange={setTipoNombre}
                  options={tiposProducto.map((item) => ({
                    value: item.nombre,
                    label: item.nombre,
                  }))}
                  placeholder="Buscar tipo de producto"
                  required
                  actionLabel="+ Agregar tipo"
                  onAction={() => setTipoModal(true)}
                />
              </label>
              <label>
                <span>Unidad de medida</span>
                <select name="unidad" defaultValue={(editando?.unidad ?? 'UNIDAD').toUpperCase()}>
                  <option value="UNIDAD">Unidad</option>
                  <option value="LITRO">Litro</option>
                  <option value="CAJA">Caja</option>
                </select>
              </label>
              <label>
                <span>Precio de venta</span>
                <input
                  name="precio"
                  type="number"
                  step="0.01"
                  min="0"
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
                  min="0"
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
                  {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar producto'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {tipoModal ? (
        <TipoProductoFormModal onClose={() => setTipoModal(false)} onSaved={handleTipoCreado} />
      ) : null}
    </div>
  );
}
