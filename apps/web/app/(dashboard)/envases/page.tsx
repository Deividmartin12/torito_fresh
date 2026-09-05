'use client';

import { Droplets } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { fechaHora } from '../../../lib/format';
import { SearchableSelect } from '../../../components/SearchableSelect';

export default function ContainersPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [form, setForm] = useState({
    clientId: '',
    movementType: 'RETORNO',
    cantidad: 1,
    notes: '',
  });
  async function load() {
    const [clientData, pendingData, movementData] = await Promise.all([
      api<any[]>('/clients?active=true'),
      api<any[]>('/containers/pending'),
      api<any[]>('/containers/movements'),
    ]);
    setClients(clientData);
    setPending(pendingData);
    setMovements(movementData);
    setForm((current) => ({ ...current, clientId: current.clientId || clientData[0]?.id || '' }));
  }

  useEffect(() => {
    load().catch((err) => toast.error(err.message));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const signedQuantity =
        form.movementType === 'RETORNO'
          ? -Math.abs(Number(form.cantidad))
          : Math.abs(Number(form.cantidad));
      await api('/containers/adjust', {
        method: 'POST',
        body: JSON.stringify({
          clientId: form.clientId,
          cantidad: signedQuantity,
          notes:
            form.notes ||
            (form.movementType === 'RETORNO'
              ? 'Retorno de envases vacíos del cliente'
              : 'Entrega de envases al cliente'),
        }),
      });
      toast.success(
        form.movementType === 'RETORNO'
          ? 'Retorno de envases registrado sin afectar la venta'
          : 'Entrega de envases registrada',
      );
      setForm({ clientId: clients[0]?.id || '', movementType: 'RETORNO', cantidad: 1, notes: '' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo ajustar envases');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">Control de envases retornables</h1>
        <p className="text-sm text-slate-500">
          Registra entregas y retornos de recipientes sin modificar la venta ni crear una devolución
          comercial.
        </p>
      </div>

      <form onSubmit={submit} className="panel grid gap-3 p-4 md:grid-cols-5">
        <label className="md:col-span-2">
          <span className="label">Cliente</span>
          <SearchableSelect
            value={String(form.clientId)}
            onChange={(value) => setForm({ ...form, clientId: value })}
            options={clients.map((client) => ({ value: String(client.id), label: client.name }))}
            placeholder="Buscar cliente"
            required
          />
        </label>
        <label>
          <span className="label">Movimiento</span>
          <select
            className="control mt-1"
            value={form.movementType}
            onChange={(e) => setForm({ ...form, movementType: e.target.value })}
          >
            <option value="RETORNO">Retorno vacío</option>
            <option value="ENTREGA">Entrega al cliente</option>
          </select>
        </label>
        <label>
          <span className="label">Cantidad</span>
          <input
            className="control mt-1"
            type="number"
            min="1"
            value={form.cantidad}
            onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })}
          />
        </label>
        <label>
          <span className="label">Nota</span>
          <input
            className="control mt-1"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <div className="flex items-end">
          <button className="btn-primary">
            <Droplets size={17} /> Registrar movimiento
          </button>
        </div>
      </form>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Clientes con envases pendientes</h2>
          <span className="text-sm font-semibold text-slate-500">{pending.length} clientes</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th>Dirección</th>
                <th>Envases pendientes</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((client) => (
                <tr key={client.id}>
                  <td className="font-semibold">{client.name}</td>
                  <td>{client.phone}</td>
                  <td>{client.address}</td>
                  <td className="font-black text-rose-700">{client.containerBalance}</td>
                </tr>
              ))}
              {!pending.length ? (
                <tr>
                  <td colSpan={4} className="text-center text-slate-500">
                    No hay envases pendientes.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-lg font-bold text-ink">Historial de entregas y retornos</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Saldo</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="font-semibold">{movement.client?.name}</td>
                  <td>{fechaHora(movement.movedAt)}</td>
                  <td>
                    {movement.type === 'IN_EMPTY'
                      ? 'RETORNO VACÍO'
                      : movement.type === 'OUT_FULL'
                        ? 'ENTREGA'
                        : 'AJUSTE'}
                  </td>
                  <td>{movement.cantidad}</td>
                  <td>{movement.balanceAfter}</td>
                  <td>{movement.notes ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
