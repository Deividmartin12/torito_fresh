"use client";

import { Pencil, Plus, Search, UserX, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ConfirmButton } from "../../../components/ConfirmButton";
import { StatusBadge } from "../../../components/StatusBadge";
import { api } from "../../../lib/api";
import { dateTime, money } from "../../../lib/format";

const emptyForm = {
  name: "",
  document: "",
  phone: "",
  address: "",
  reference: "",
  type: "HOME",
};

const clientTypes: Record<string, string> = {
  HOME: "Hogar",
  COMPANY: "Empresa",
  STORE: "Tienda",
  RESTAURANT: "Restaurante",
};

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    setClients(await api<any[]>(`/clients${params}`));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (editingId) {
        await api(`/clients/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
        setMessage("Cliente actualizado");
      } else {
        await api("/clients", { method: "POST", body: JSON.stringify(form) });
        setMessage("Cliente registrado");
      }
      setForm(emptyForm);
      setEditingId("");
      setIsModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  function edit(client: any) {
    setEditingId(client.id);
    setForm({
      name: client.name ?? "",
      document: client.document ?? "",
      phone: client.phone ?? "",
      address: client.address ?? "",
      reference: client.reference ?? "",
      type: client.type ?? "HOME",
    });
    setIsModalOpen(true);
  }

  function openCreateModal() {
    setEditingId("");
    setForm(emptyForm);
    setError("");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingId("");
    setForm(emptyForm);
  }

  async function deactivate(id: string) {
    await api(`/clients/${id}/deactivate`, { method: "PATCH" });
    await load();
  }

  async function viewHistory(id: string) {
    setSelected(await api(`/clients/${id}`));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="border rounded-full my-1 px-3 py-2 flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
            <h1 className="text-2xl font-black text-ink">Clientes</h1>
            <div className="text-sm font-semibold text-slate-500">{clients.length} clientes</div>
        </div>
        <div className="flex items-center">
          <button className="btn-circular" onClick={openCreateModal}>
            <Plus size={17} />
          </button>
         </div>
      </div>

      <section className="panel mt-4">
        <div className="flex max-w-md flex-1 gap-2 justify-between items-center rounded-full border px-4 py-1 mb-2">
          <Search size={17} />
          <input
            className="control"
            placeholder="Buscar por nombre, documento o telefono"
            value={search} onChange={(e) => setSearch(e.target.value)} 
          />
        </div>

        {message ? <p className="mb-3 rounded-md bg-emerald-50 p-2 text-sm font-semibold text-emerald-700">{message}</p> : null}
        {error ? <p className="mb-3 rounded-md bg-rose-50 p-2 text-sm font-semibold text-rose-700">{error}</p> : null}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contacto</th>
                <th>Tipo</th>
                <th>Deuda</th>
                <th>Envases</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-slate-50">
                  <td>
                    <button className="text-left font-bold text-brand-700" onClick={() => viewHistory(client.id)}>{client.name}</button>
                    <p className="text-xs text-slate-500">{client.document || "Sin documento"}</p>
                  </td>
                  <td>
                    {client.phone}
                    <p className="text-xs text-slate-500">
                      {client.address}
                    </p>
                  </td>
                  <td>{clientTypes[client.type] ?? client.type}</td>
                  <td>{money(client.debtBalance)}</td>
                  <td>{client.containerBalance}</td>
                  <td><StatusBadge value={client.active ? "ACTIVE" : "INACTIVE"} /></td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary" onClick={() => edit(client)} title="Editar"><Pencil size={16} /></button>
                      {client.active ? (
                        <ConfirmButton className="btn-secondary" message="Desea desactivar este cliente?" onConfirm={() => deactivate(client.id)}>
                          <UserX size={16} />
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

      {selected ? (
        <section className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">Historial de {selected.name}</h2>
            <button className="btn-secondary" onClick={() => setSelected(null)}>Cerrar</button>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <div>
              <h3 className="mb-2 text-sm font-bold">Pedidos recientes</h3>
              <ul className="space-y-2 text-sm">
                {selected.orders?.map((order: any) => <li key={order.id} className="rounded-md bg-slate-50 p-2">{dateTime(order.orderedAt)} - {money(order.total)}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold">Pagos</h3>
              <ul className="space-y-2 text-sm">
                {selected.payments?.map((payment: any) => <li key={payment.id} className="rounded-md bg-slate-50 p-2">{dateTime(payment.paidAt)} - {money(payment.amount)}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold">Envases</h3>
              <ul className="space-y-2 text-sm">
                {selected.containerMoves?.map((move: any) => <li key={move.id} className="rounded-md bg-slate-50 p-2">{move.type} - saldo {move.balanceAfter}</li>)}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="panel max-h-[90vh] w-full max-w-3xl overflow-y-auto p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-ink">{editingId ? "Editar cliente" : "Agregar cliente"}</h2>
              <button type="button" className="btn-secondary h-9 w-9 p-0" onClick={closeModal} title="Cerrar">
                <X size={17} />
              </button>
            </div>
            <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="label">Nombre o razon social</span>
                <input className="control mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                <span className="label">DNI/RUC</span>
                <input className="control mt-1" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
              </label>
              <label>
                <span className="label">Telefono</span>
                <input className="control mt-1" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              </label>
              <label>
                <span className="label">Tipo</span>
                <select className="control mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(clientTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="md:col-span-2">
                <span className="label">Direccion</span>
                <input className="control mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
              </label>
              <label className="md:col-span-2">
                <span className="label">Referencia</span>
                <input className="control mt-1" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              </label>
              <div className="flex justify-end gap-2 md:col-span-2">
                <button type="button" className="btn-secondary" onClick={closeModal}>Cancelar</button>
                <button className="btn-primary">
                  <Plus size={17} />
                  {editingId ? "Actualizar" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
