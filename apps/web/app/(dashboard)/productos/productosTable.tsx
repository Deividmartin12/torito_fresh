import { Pencil, ToggleLeft } from "lucide-react";
import { ConfirmButton } from "../../../components/ConfirmButton";
import { StatusBadge } from "../../../components/StatusBadge";
import { money } from "../../../lib/format";
import { categorias, type Producto } from "./types";

type Props = {
  productos: Producto[];
  onEdit: (producto: Producto) => void;
  onDeactivate: (id: string) => void;
};

export function ProductosTable({ productos, onEdit, onDeactivate }: Props) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoria</th>
            <th>Precio</th>
            <th>Stock</th>
            <th>Retornable</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((producto) => (
            <tr key={producto.id}>
              <td className="font-semibold">{producto.name}<p className="text-xs text-slate-500">{producto.sku || "Sin SKU"}</p></td>
              <td>{categorias[producto.category] ?? producto.category}</td>
              <td>{money(producto.price)}</td>
              <td>{producto.stock}</td>
              <td>{producto.returnable ? "Si" : "No"}</td>
              <td><StatusBadge value={producto.active ? "ACTIVE" : "INACTIVE"} /></td>
              <td>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => onEdit(producto)} title="Editar"><Pencil size={16} /></button>
                  {producto.active ? (
                    <ConfirmButton className="btn-secondary" message="Desea desactivar este producto?" onConfirm={() => onDeactivate(producto.id)}>
                      <ToggleLeft size={16} />
                    </ConfirmButton>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
