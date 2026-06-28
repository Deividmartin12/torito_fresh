"use client";

import { ClipboardPlus, Plus, Route, XCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConfirmButton } from "../../../components/ConfirmButton";
import { StatusBadge } from "../../../components/StatusBadge";
import { api } from "../../../lib/api";
import { dateTime, money } from "../../../lib/format";

const statuses: Record<string, string> = {
  PENDING: "Pendiente",
  PREPARING: "En preparacion",
  ON_ROUTE: "En ruta",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

export default function OrdersPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ clientId: "", deliveryUserId: "", observations: "" });
  const [items, setItems] = useState<any[]>([{ productId: "", quantity: 1 }]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [clientData, productData, userData, orderData] = await Promise.all([
      api<any[]>("/clients?active=true"),
      api<any[]>("/products?active=true"),
      api<any[]>("/users?role=DELIVERY"),
      api<any[]>("/orders"),
    ]);
    setClients(clientData);
    setProducts(productData);
    setDeliveries(userData);
    setOrders(orderData);
    setForm((current: any) => ({
      ...current,
      clientId: current.clientId || clientData[0]?.id || "",
      deliveryUserId: current.deliveryUserId || userData[0]?.id || "",
    }));
    setItems((current) => current.map((item) => ({ ...item, productId: item.productId || productData[0]?.id || "" })));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const orderTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const product = products.find((current) => current.id === item.productId);
      return sum + Number(product?.price ?? 0) * Number(item.quantity ?? 0);
    }, 0);
  }, [items, products]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          deliveryUserId: form.deliveryUserId || undefined,
          items: items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity) })),
        }),
      });
      setMessage("Pedido creado");
      setForm({ clientId: clients[0]?.id || "", deliveryUserId: deliveries[0]?.id || "", observations: "" });
      setItems([{ productId: products[0]?.id || "", quantity: 1 }]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear pedido");
    }
  }

  async function updateStatus(id: string, status: string) {
    await api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  async function assign(id: string, deliveryUserId: string) {
    await api(`/orders/${id}/assign`, { method: "PATCH", body: JSON.stringify({ deliveryUserId }) });
    await load();
  }

  async function cancel(id: string) {
    await api(`/orders/${id}/cancel`, { method: "PATCH" });
    await load();
  }

  function setItem(index: number, patch: any) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Pedidos</h1>
        <p className="text-sm text-slate-500">Crear pedidos, asignar repartidor y controlar estados.</p>
      </div>

      <form onSubmit={submit} className="panel space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label>
            <span className="label">Cliente</span>
            <select className="control mt-1" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Repartidor</span>
            <select className="control mt-1" value={form.deliveryUserId} onChange={(e) => setForm({ ...form, deliveryUserId: e.target.value })}>
              <option value="">Sin asignar</option>
              {deliveries.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Observaciones</span>
            <input className="control mt-1" value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-ink">Productos del pedido</h2>
            <button type="button" className="btn-secondary" onClick={() => setItems([...items, { productId: products[0]?.id || "", quantity: 1 }])}>
              <Plus size={16} />
              Item
            </button>
          </div>
          <div className="grid gap-2">
            {items.map((item, index) => {
              const product = products.find((current) => current.id === item.productId);
              return (
                <div key={index} className="grid gap-2 rounded-md bg-slate-50 p-2 md:grid-cols-[1fr_120px_120px_44px]">
                  <select className="control" value={item.productId} onChange={(e) => setItem(index, { productId: e.target.value })}>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} - stock {product.stock}</option>)}
                  </select>
                  <input className="control" type="number" min="1" value={item.quantity} onChange={(e) => setItem(index, { quantity: e.target.value })} />
                  <div className="flex h-10 items-center rounded-md bg-white px-3 text-sm font-bold">{money(Number(product?.price ?? 0) * Number(item.quantity ?? 0))}</div>
                  <button type="button" className="btn-secondary px-0" onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))} title="Quitar item">
                    <XCircle size={17} />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-right text-lg font-black text-ink">Total: {money(orderTotal)}</p>
        </div>

        {message ? <p className="rounded-md bg-emerald-50 p-2 text-sm font-semibold text-emerald-700">{message}</p> : null}
        {error ? <p className="rounded-md bg-rose-50 p-2 text-sm font-semibold text-rose-700">{error}</p> : null}
        <button className="btn-primary">
          <ClipboardPlus size={17} />
          Crear pedido
        </button>
      </form>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Lista de pedidos</h2>
          <span className="text-sm font-semibold text-slate-500">{orders.length} pedidos</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Items</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Repartidor</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="font-semibold">{order.client?.name}</td>
                  <td>{dateTime(order.orderedAt)}</td>
                  <td>{order.items?.map((item: any) => `${item.quantity} ${item.product?.name}`).join(", ")}</td>
                  <td>{money(order.total)}</td>
                  <td><StatusBadge value={order.status} /></td>
                  <td>
                    <select
                      className="control min-w-40"
                      value={order.deliveryUserId ?? ""}
                      disabled={order.status === "DELIVERED" || order.status === "CANCELLED"}
                      onChange={(e) => e.target.value && assign(order.id, e.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {deliveries.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {order.status === "PENDING" ? <button className="btn-secondary" onClick={() => updateStatus(order.id, "PREPARING")}>Preparar</button> : null}
                      {order.status !== "DELIVERED" && order.status !== "CANCELLED" && order.deliveryUserId ? (
                        <button className="btn-secondary" onClick={() => assign(order.id, order.deliveryUserId)}>
                          <Route size={16} />
                          Ruta
                        </button>
                      ) : null}
                      {order.status !== "DELIVERED" && order.status !== "CANCELLED" ? (
                        <ConfirmButton className="btn-danger" message="Desea cancelar este pedido?" onConfirm={() => cancel(order.id)}>
                          Cancelar
                        </ConfirmButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
