'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Droplets } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { fechaHora } from '../../../lib/format';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { Button } from '../../../components/ui/Button';

export default function ContainersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    clientId: '',
    movementType: 'RETORNO',
    cantidad: 1,
    notes: '',
  });

  const clientsQuery = useQuery({
    queryKey: ['clients', 'active'],
    queryFn: () => api<any[]>('/clients?active=true'),
  });
  const clients = clientsQuery.data ?? [];
  const pendingQuery = useQuery({
    queryKey: ['containers-pending'],
    queryFn: () => api<any[]>('/containers/pending'),
  });
  const pending = pendingQuery.data ?? [];
  const movementsQuery = useQuery({
    queryKey: ['containers-movements'],
    queryFn: () => api<any[]>('/containers/movements'),
  });
  const movements = movementsQuery.data ?? [];

  async function load() {
    await Promise.all([clientsQuery.refetch(), pendingQuery.refetch(), movementsQuery.refetch()]);
  }
  useEffect(() => {
    if (clients.length && !form.clientId) {
      setForm((current) => ({ ...current, clientId: clients[0]?.id ?? '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);
  useEffect(() => {
    const fallo = [clientsQuery, pendingQuery, movementsQuery].find((query) => query.error)?.error;
    if (fallo) toast.error(fallo instanceof Error ? fallo.message : 'No se pudo cargar la página');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientsQuery.error, pendingQuery.error, movementsQuery.error]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cantidad = Math.abs(Number(form.cantidad));
    if (!form.clientId) {
      toast.error('Selecciona un cliente.');
      return;
    }
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      toast.error('La cantidad debe ser un número entero mayor a 0.');
      return;
    }
    try {
      const signedQuantity = form.movementType === 'RETORNO' ? -cantidad : cantidad;
      await api('/containers/adjust', {
        method: 'POST',
        body: JSON.stringify({
          clientId: form.clientId,
          quantity: signedQuantity,
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
    <div className="module-page envases-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Control de envases retornables</h1>
        </div>
      </div>
      <p className="envases-intro">
        Registra entregas y retornos de recipientes sin modificar la venta ni crear una devolución
        comercial.
      </p>

      <form onSubmit={submit} className="panel envases-form">
        <label className="envases-field-wide">
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
            className="control"
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
            className="control"
            type="number"
            min="1"
            step="1"
            value={form.cantidad}
            onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })}
            required
          />
        </label>
        <label>
          <span className="label">Nota</span>
          <input
            className="control"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <div>
          <Button className="w-full">
            <Droplets size={17} /> Registrar movimiento
          </Button>
        </div>
      </form>

      <section className="panel envases-section">
        <div className="envases-section-head">
          <h2>Clientes con envases pendientes</h2>
          <span>{pending.length} clientes</span>
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
                  <td className="envases-strong">{client.name}</td>
                  <td>{client.phone}</td>
                  <td>{client.address}</td>
                  <td className="envases-pending">{client.containerBalance}</td>
                </tr>
              ))}
              {!pending.length ? (
                <tr>
                  <td colSpan={4}>
                    <div className="table-empty">
                      <span>No hay envases pendientes.</span>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel envases-section">
        <div className="envases-section-head">
          <h2>Historial de entregas y retornos</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Saldo</th>
                <th>Origen</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="envases-strong">{movement.client?.name}</td>
                  <td>{fechaHora(movement.movedAt)}</td>
                  <td>
                    {movement.type === 'IN_EMPTY'
                      ? 'RETORNO VACÍO'
                      : movement.type === 'OUT_FULL'
                        ? 'ENTREGA'
                        : 'AJUSTE'}
                  </td>
                  {/* El API lo devuelve como `quantity`. Decía `cantidad` y la columna salía
                      siempre vacía. */}
                  <td>{movement.quantity}</td>
                  <td>{movement.balanceAfter}</td>
                  {/* De dónde salió el movimiento: una venta lo trae con su código, y lo que
                      se cargó desde esta misma pantalla no tiene venta. */}
                  <td>{movement.venta ?? 'Ajuste manual'}</td>
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
