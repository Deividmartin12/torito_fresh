import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import type { Producto, ProductoPayload } from "./types";

export function useProductos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    setProductos(await api<Producto[]>(`/productos${params}`));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function save(payload: ProductoPayload, editingId?: string) {
    setError("");
    setMessage("");
    try {
      if (editingId) {
        await api(`/productos/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
        setMessage("Producto actualizado");
      } else {
        await api("/productos", { method: "POST", body: JSON.stringify(payload) });
        setMessage("Producto registrado");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      throw err;
    }
  }

  async function deactivate(id: string) {
    await api(`/productos/${id}/deactivate`, { method: "PATCH" });
    await load();
  }

  return { productos, search, setSearch, error, message, load, save, deactivate };
}
