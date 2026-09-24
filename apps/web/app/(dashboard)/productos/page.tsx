'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Pencil, Search, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { AddButton } from '../../../components/ui/AddButton';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import {
  checkboxFieldClass,
  checkboxInputClass,
  controlClass,
  fieldLabelClass,
  modalActionsClass,
  modalFormClass,
} from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { Modal, ModalHeader } from '../../../components/ui/Modal';
import {
  TipoProductoCreado,
  TipoProductoFormModal,
} from '../../../components/TipoProductoFormModal';
import { useUnidad } from '../../../components/UnidadProvider';
import { api } from '../../../lib/api';
import { puede } from '../../../lib/permissions';
import { soloTextoNombre, validarMonto, validarNombreLibre } from '../../../lib/validacion';
import { usePermisos } from '../../../lib/useCurrentUser';

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
  const queryClient = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [tipo, setTipo] = useState('Todos');
  const [modal, setModal] = useState(false);
  const [tipoModal, setTipoModal] = useState(false);
  const [tipoNombre, setTipoNombre] = useState('');
  const [editando, setEditando] = useState<Producto | null>(null);
  const [guardando, setGuardando] = useState(false);
  // El catálogo de productos es compartido entre unidades: solo lo edita quien administra la
  // operación. Antes bastaba con no ser repartidor, y el responsable de un puesto veía los
  // botones de crear y borrar aunque el API se los rechazara.
  const editable = puede(usePermisos(), 'productos.editar');
  const { controlaInventario } = useUnidad();

  const datosQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => api<Producto[]>('/operations/products'),
  });
  const datos = datosQuery.data ?? [];
  useEffect(() => {
    if (datosQuery.error) {
      toast.error(
        datosQuery.error instanceof Error
          ? datosQuery.error.message
          : 'No se pudieron cargar los productos',
      );
    }
  }, [datosQuery.error]);

  // Catálogo secundario: si falla, se queda vacío en silencio, igual que antes.
  const tiposQuery = useQuery({
    queryKey: ['product-types'],
    queryFn: () => api<{ id: string; nombre: string }[]>('/operations/product-types'),
  });
  const tiposProducto = tiposQuery.data ?? [];

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
  function abrir(item?: Producto) {
    setEditando(item ?? null);
    setTipoNombre(item?.tipo ?? '');
    setModal(true);
  }
  // Tipo creado desde el combo del formulario: lo sumamos a la lista y lo dejamos elegido.
  function handleTipoCreado(tipo: TipoProductoCreado) {
    queryClient.setQueryData<{ id: string; nombre: string }[]>(['product-types'], (current) =>
      current?.some((item) => item.nombre === tipo.nombre) ? current : [...(current ?? []), tipo],
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
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product-types'] });
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
      queryClient.setQueryData<Producto[]>(['products'], (current) =>
        current?.filter((product) => product.id !== item.id),
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo eliminar el producto');
    }
  }
  const columns: DataTableColumn<Producto>[] = [
    {
      key: 'producto',
      header: 'Producto',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.nombre}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            {item.codigo} · {item.capacidad}
          </small>
        </>
      ),
    },
    { key: 'tipo', header: 'Tipo', render: (item) => item.tipo },
    { key: 'unidad', header: 'Unidad', render: (item) => item.unidad },
    { key: 'precio', header: 'Precio venta', render: (item) => `S/ ${item.precio.toFixed(2)}` },
    { key: 'costo', header: 'Costo ref.', render: (item) => `S/ ${item.costo.toFixed(2)}` },
    // En un puesto que no lleva inventario la columna daría 0 en todo y solo confundiría:
    // el catálogo sí se usa, el stock no existe.
    ...(controlaInventario
      ? [
          {
            key: 'stock',
            header: 'Stock global',
            render: (item: Producto) => item.stock,
          } satisfies DataTableColumn<Producto>,
        ]
      : []),
    {
      key: 'control',
      header: 'Control',
      render: (item) => (item.lote ? 'Lote' : item.retornable ? 'Retornable' : 'Simple'),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => (
        <Badge tone={item.activo ? 'green' : 'amber'}>{item.activo ? 'Activo' : 'Inactivo'}</Badge>
      ),
    },
    ...(editable
      ? [
          {
            key: 'acciones',
            header: 'Acciones',
            cardLabel: null,
            render: (item: Producto) => (
              <div className="flex flex-wrap gap-[7px]">
                <IconButton onClick={() => abrir(item)} title="Editar producto">
                  <Pencil size={16} />
                </IconButton>
                <IconButton title="Ver stock">
                  <Boxes size={16} />
                </IconButton>
                <IconButton
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
                </IconButton>
              </div>
            ),
          } satisfies DataTableColumn<Producto>,
        ]
      : []),
  ];

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Productos</h1>
          <span>{datos.length} productos</span>
        </div>
        {editable ? <AddButton label="Agregar producto" onClick={() => abrir()} /> : null}
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar por código o nombre"
          />
        </label>
        <select
          className="filter-pill"
          value={tipo}
          onChange={(event) => setTipo(event.target.value)}
        >
          <option>Todos</option>
          {tipos.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      <DataTable
        columns={columns}
        rows={productos}
        rowKey={(item) => item.id}
        emptyMessage={
          <div className="flex flex-col items-center gap-2.5">
            <Search size={22} />
            <span>No hay productos que coincidan con los filtros.</span>
          </div>
        }
      />
      {modal ? (
        <Modal onClose={() => setModal(false)} closeDisabled={guardando}>
          <ModalHeader
            title={editando ? 'Editar producto' : 'Agregar producto'}
            onClose={() => setModal(false)}
          />
          <form className={modalFormClass} onSubmit={guardar}>
            {editando ? (
              <label>
                <span className={fieldLabelClass}>Código</span>
                <input className={controlClass} value={editando.codigo} disabled />
              </label>
            ) : null}
            <label>
              <span className={fieldLabelClass}>Nombre</span>
              <input
                className={controlClass}
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
              <span className={fieldLabelClass}>Tipo de producto</span>
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
              <span className={fieldLabelClass}>Unidad de medida</span>
              <select
                className={controlClass}
                name="unidad"
                defaultValue={(editando?.unidad ?? 'UNIDAD').toUpperCase()}
              >
                <option value="UNIDAD">Unidad</option>
                <option value="LITRO">Litro</option>
                <option value="CAJA">Caja</option>
              </select>
            </label>
            <label>
              <span className={fieldLabelClass}>Precio de venta</span>
              <input
                className={controlClass}
                name="precio"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editando?.precio}
                required
              />
            </label>
            <label>
              <span className={fieldLabelClass}>Costo de referencia</span>
              <input
                className={controlClass}
                name="costo"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editando?.costo}
                required
              />
            </label>
            <label className={checkboxFieldClass}>
              <input
                className={checkboxInputClass}
                name="lote"
                type="checkbox"
                defaultChecked={editando?.lote}
              />
              <span className="text-[13px] font-medium">Controla lote</span>
            </label>
            <label className={checkboxFieldClass}>
              <input
                className={checkboxInputClass}
                name="retornable"
                type="checkbox"
                defaultChecked={editando?.retornable}
              />
              <span className="text-[13px] font-medium">Es retornable</span>
            </label>
            <div className={modalActionsClass}>
              <Button variant="secondary" type="button" onClick={() => setModal(false)}>
                Cancelar
              </Button>
              <Button disabled={guardando}>
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar producto'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
      {tipoModal ? (
        <TipoProductoFormModal onClose={() => setTipoModal(false)} onSaved={handleTipoCreado} />
      ) : null}
    </div>
  );
}
