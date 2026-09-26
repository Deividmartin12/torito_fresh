'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { CatalogItem, etiquetaProducto } from '../../lib/operations';
import { SearchableSelect } from '../SearchableSelect';
import { Button } from '../ui/Button';
import { controlClass, fieldLabelClass, modalActionsClass, modalFormClass } from '../ui/Field';
import { Modal, ModalHeader } from '../ui/Modal';

type Lote = { id: string; codigo: string; productoId: string; estado: string };

export type PosicionNueva = {
  productoId: string;
  producto: string;
  codigo: string;
  unidadMedida: string;
  controlaLote: boolean;
  loteId: string | null;
  lote: string;
  costoUnitario: number;
};

/**
 * Agrega al conteo una posición que todavía no existe en el almacén.
 *
 * Hace falta un diálogo y no una lista precargada porque producto × lote × estado es un
 * espacio combinatorio: no se puede ofrecer "todas las posiciones posibles". Este es también
 * el camino de la carga inicial de inventario, que es exactamente contar contra un teórico de
 * cero.
 */
export function AddPositionDialog({
  productos,
  yaEnLaHoja,
  onClose,
  onAdd,
}: {
  productos: CatalogItem[];
  /** Claves `productoId|loteId|estadoId` que ya están en la hoja, para no duplicarlas. */
  yaEnLaHoja: Set<string>;
  onClose: () => void;
  onAdd: (posicion: PosicionNueva) => void;
}) {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [productoId, setProductoId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [costo, setCosto] = useState('');

  useEffect(() => {
    api<Lote[]>('/operations/lots')
      .then(setLotes)
      .catch(() => setLotes([]));
  }, []);

  const producto = productos.find((item) => item.id === productoId);
  // `controlaLote` no viene en el catálogo de operaciones, así que se deduce: si el producto
  // tiene lotes creados, se le exige elegir uno.
  const lotesDelProducto = useMemo(
    () => lotes.filter((lote) => lote.productoId === productoId),
    [lotes, productoId],
  );

  function agregar() {
    if (!producto) return toast.error('Elegí el producto.');
    if (lotesDelProducto.length > 0 && !loteId)
      return toast.error('Elegí el lote que estás contando.');
    const clave = `${productoId}|${loteId}|1`;
    if (yaEnLaHoja.has(clave)) return toast.error('Esa posición ya está en la hoja.');
    onAdd({
      productoId,
      producto: producto.nombre,
      codigo: producto.codigo ?? '',
      unidadMedida: '',
      controlaLote: lotesDelProducto.length > 0,
      loteId: loteId || null,
      lote: lotesDelProducto.find((lote) => lote.id === loteId)?.codigo ?? 'Sin lote',
      costoUnitario: Number(costo) || producto.costoReferencia || 0,
    });
    onClose();
  }

  return createPortal(
    <Modal onClose={onClose}>
      <ModalHeader title="Agregar al conteo" onClose={onClose} />
      <div className={modalFormClass}>
        <label>
          <span className={fieldLabelClass}>Producto</span>
          <SearchableSelect
            value={productoId}
            onChange={(value) => {
              setProductoId(value);
              setLoteId('');
            }}
            options={productos.map((item) => ({
              value: item.id,
              label: etiquetaProducto(item),
            }))}
            placeholder="Buscar producto"
          />
        </label>
        {lotesDelProducto.length > 0 ? (
          <label>
            <span className={fieldLabelClass}>Lote</span>
            <SearchableSelect
              value={loteId}
              onChange={setLoteId}
              options={lotesDelProducto.map((lote) => ({
                value: lote.id,
                label: lote.codigo,
                hint: lote.estado,
              }))}
              placeholder="Buscar lote"
            />
          </label>
        ) : null}
        <label>
          <span className={fieldLabelClass}>Costo por unidad</span>
          <input
            className={controlClass}
            type="text"
            inputMode="decimal"
            value={costo}
            onChange={(event) => setCosto(event.target.value.replace(/[^0-9.]/g, ''))}
            placeholder={String(producto?.costoReferencia ?? 0)}
          />
          <small className="auto-note">
            Es el valor con el que entra al inventario. Si lo dejás vacío se usa el costo de
            referencia del producto.
          </small>
        </label>
      </div>
      <div className={modalActionsClass}>
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" onClick={agregar}>
          Agregar
        </Button>
      </div>
    </Modal>,
    document.body,
  );
}
