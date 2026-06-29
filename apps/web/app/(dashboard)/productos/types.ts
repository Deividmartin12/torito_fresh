export type Producto = {
  id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  category: string;
  price: number | string;
  stock: number;
  returnable: boolean;
  active: boolean;
};

export type ProductoPayload = {
  name: string;
  sku: string;
  description: string;
  category: string;
  price: number | string;
  stock: number | string;
  returnable: boolean;
};

export const emptyProducto: ProductoPayload = {
  name: "",
  sku: "",
  description: "",
  category: "WATER",
  price: 0,
  stock: 0,
  returnable: false,
};

export const categorias: Record<string, string> = {
  WATER: "Agua",
  DISPENSER: "Dispensador",
  ACCESSORY: "Accesorio",
  OTHER: "Otro",
};

export function toPayload(producto: Producto): ProductoPayload {
  return {
    name: producto.name ?? "",
    sku: producto.sku ?? "",
    description: producto.description ?? "",
    category: producto.category ?? "WATER",
    price: Number(producto.price ?? 0),
    stock: Number(producto.stock ?? 0),
    returnable: Boolean(producto.returnable),
  };
}
