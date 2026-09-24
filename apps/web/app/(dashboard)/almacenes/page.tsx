'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Pencil, Search } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { AddButton } from '../../../components/ui/AddButton';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import {
  controlClass,
  fieldLabelClass,
  fieldWideClass,
  modalActionsClass,
  modalFormClass,
} from '../../../components/ui/Field';
import { IconButton } from '../../../components/ui/IconButton';
import { Modal, ModalHeader } from '../../../components/ui/Modal';
import { soloTextoNombre, validarNombreLibre } from '../../../lib/validacion';

type Almacen = {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string;
  responsable: string;
  productos: number;
  unidades: number;
  activo: boolean;
};

export default function AlmacenesPage() {
  const queryClient = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Almacen | null>(null);
  const [guardando, setGuardando] = useState(false);
  const query = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api<Almacen[]>('/operations/warehouses'),
  });
  const almacenes = query.data ?? [];
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error ? query.error.message : 'No se pudieron cargar los almacenes',
      );
    }
  }, [query.error]);
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
    const nombre = String(values.get('nombre') ?? '').trim();
    const errorNombre = validarNombreLibre(nombre, 'el nombre del almacén');
    if (errorNombre) {
      toast.error(errorNombre);
      return;
    }
    setGuardando(true);
    try {
      await api('/operations/warehouses', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          direccion: String(values.get('direccion') ?? '').trim() || undefined,
        }),
      });
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      setModal(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar el almacén');
    } finally {
      setGuardando(false);
    }
  }

  const columns: DataTableColumn<Almacen>[] = [
    {
      key: 'almacen',
      header: 'Almacén',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.nombre}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">{item.codigo}</small>
        </>
      ),
    },
    { key: 'direccion', header: 'Dirección', render: (item) => item.direccion },
    { key: 'responsable', header: 'Responsable', render: (item) => item.responsable },
    { key: 'productos', header: 'Productos', render: (item) => item.productos },
    { key: 'unidades', header: 'Unidades', render: (item) => item.unidades },
    {
      key: 'estado',
      header: 'Estado',
      render: () => <Badge tone="green">Activo</Badge>,
    },
    {
      key: 'acciones',
      header: 'Acciones',
      cardLabel: null,
      render: (item) => (
        <div className="flex flex-wrap gap-[7px]">
          <IconButton onClick={() => abrir(item)} title="Editar almacén">
            <Pencil size={16} />
          </IconButton>
          <IconButton title="Ver stock">
            <Boxes size={16} />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Almacenes</h1>
          <span>{almacenes.length} almacenes</span>
        </div>
        <AddButton label="Agregar almacén" onClick={() => abrir()} />
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar por código, nombre o responsable"
          />
        </label>
      </div>
      <DataTable
        columns={columns}
        rows={visibles}
        rowKey={(item) => item.id}
        emptyMessage={
          <div className="flex flex-col items-center gap-2.5">
            <Search size={22} />
            <span>No hay almacenes que coincidan con la búsqueda.</span>
          </div>
        }
      />
      {modal ? (
        <Modal onClose={() => setModal(false)} closeDisabled={guardando}>
          <ModalHeader
            title={editando ? 'Editar almacén' : 'Agregar almacén'}
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
                maxLength={80}
                onChange={(event) => {
                  event.target.value = soloTextoNombre(event.target.value);
                }}
                required
              />
            </label>
            <label className={fieldWideClass}>
              <span className={fieldLabelClass}>Dirección</span>
              <input
                className={controlClass}
                name="direccion"
                defaultValue={editando?.direccion}
                maxLength={250}
              />
            </label>
            <div className={modalActionsClass}>
              <Button variant="secondary" type="button" onClick={() => setModal(false)}>
                Cancelar
              </Button>
              <Button disabled={guardando}>
                {guardando ? 'Registrando...' : editando ? 'Guardar cambios' : 'Registrar almacén'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
