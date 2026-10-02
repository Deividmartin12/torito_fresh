'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { CatalogItem, etiquetaProducto } from '../../lib/operations';
import { SearchableSelect } from '../SearchableSelect';
import { Button } from '../ui/Button';
import { controlClass, fieldLabelClass, modalActionsClass, modalFormClass } from '../ui/Field';
import { Modal, ModalHeader } from '../ui/Modal';

export type PosicionNueva = {
  productoId: string;
  producto: string;
  codigo: string;
  unidadMedida: string;
  costoUnitario: number;
};

/**
 * Agrega al conteo un producto que todavía no existe en el almacén.
 *
 * El cuadre es por producto (los lotes van agregados), así que acá solo se elige el
 * producto y su costo. Este es también el camino de la carga inicial de inventario, que
 * es exactamente contar contra un teórico de cero.
 */
export function AddPositionDialog({
  productos,
  yaEnLaHoja,
  onClose,
  onAdd,
}: {
  productos: CatalogItem[];
  /** Claves `productoId|estadoId` que ya están en la hoja, para no duplicarlas. */
  yaEnLaHoja: Set<string>;
  onClose: () => void;
  onAdd: (posicion: PosicionNueva) => void;
}) {
  const [productoId, setProductoId] = useState('');
  const [costo, setCosto] = useState('');

  const producto = productos.find((item) => item.id === productoId);

  function agregar() {
    if (!producto) return toast.error('Elegí el producto.');
    const clave = `${productoId}|1`;
    if (yaEnLaHoja.has(clave)) return toast.error('Ese producto ya está en la hoja.');
    onAdd({
      productoId,
      producto: producto.nombre,
      codigo: producto.codigo ?? '',
      unidadMedida: '',
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
            onChange={setProductoId}
            options={productos.map((item) => ({
              value: item.id,
              label: etiquetaProducto(item),
            }))}
            placeholder="Buscar producto"
          />
        </label>
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
