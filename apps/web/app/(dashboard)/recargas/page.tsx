'use client';

import { CalendarClock, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { moneda } from '../../../lib/format';
import { EstadoRecarga, RecargaCliente, getRecargas } from '../../../lib/recargas';

const ESTADO_INFO: Record<EstadoRecarga, { label: string; clase: string }> = {
  ATRASADO: { label: 'Atrasado', clase: 'status status-red' },
  POR_VENCER: { label: 'Por vencer', clase: 'status status-amber' },
  AL_DIA: { label: 'Al día', clase: 'status status-green' },
  SIN_HISTORIAL: { label: 'Sin historial', clase: 'status status-gray' },
};

const fechaCorta = (valor: string | null) =>
  valor ? new Date(`${valor.slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE') : '—';

export default function RecargasPage() {
  const [recargas, setRecargas] = useState<RecargaCliente[]>([]);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<'Todos' | EstadoRecarga>('Todos');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecargas(await getRecargas());
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar las recargas', {
        action: { label: 'Reintentar', onClick: () => void load() },
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // El servidor ya ordena por urgencia; aquí solo se refina por estado y por nombre.
  const visibles = useMemo(
    () =>
      recargas.filter(
        (item) =>
          (estado === 'Todos' || item.estado === estado) &&
          item.cliente.toLowerCase().includes(search.toLowerCase()),
      ),
    [recargas, estado, search],
  );

  const conIntervalo = recargas.filter((item) => item.intervaloDias !== null);
  const intervaloPromedio = conIntervalo.length
    ? Math.round(
        conIntervalo.reduce((suma, item) => suma + (item.intervaloDias ?? 0), 0) /
          conIntervalo.length,
      )
    : 0;
  const pagoPromedio = recargas.length
    ? recargas.reduce((suma, item) => suma + item.pagoPromedio, 0) / recargas.length
    : 0;
  const porRecargarPronto = recargas.filter(
    (item) => item.estado === 'ATRASADO' || item.estado === 'POR_VENCER',
  ).length;

  return (
    <div className="module-page operations-list-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Ventas</span>
          <h1>Frecuencia de recarga</h1>
          <p>
            Cada cuánto vuelve a comprar cada cliente y cuánto paga. Se calcula con el intervalo
            entre sus ventas confirmadas.
          </p>
        </div>
      </div>
      <div className="summary-row">
        <div className="summary-glass">
          <span>Intervalo promedio</span>
          <strong>{intervaloPromedio} días</strong>
          <small>Entre una recarga y la siguiente</small>
        </div>
        <div className="summary-glass">
          <span>Pago promedio</span>
          <strong>{moneda(pagoPromedio)}</strong>
          <small>Por recarga</small>
        </div>
        <div className="summary-glass">
          <span>Por recargar pronto</span>
          <strong>{porRecargarPronto}</strong>
          <small>Atrasados o por vencer</small>
        </div>
        <div className="summary-glass">
          <span>Clientes con historial</span>
          <strong>{conIntervalo.length}</strong>
          <small>Con 2 o más recargas</small>
        </div>
      </div>
      <div className="module-tools operations-filters">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente"
          />
        </label>
        <label className="filter-field">
          <span>Estado</span>
          <select
            className="filter-pill"
            value={estado}
            onChange={(event) => setEstado(event.target.value as 'Todos' | EstadoRecarga)}
          >
            <option value="Todos">Todos</option>
            <option value="ATRASADO">Atrasado</option>
            <option value="POR_VENCER">Por vencer</option>
            <option value="AL_DIA">Al día</option>
            <option value="SIN_HISTORIAL">Sin historial</option>
          </select>
        </label>
      </div>
      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando recargas...
        </div>
      ) : recargas.length === 0 ? (
        <div className="empty-state">
          <CalendarClock size={34} />
          <h2>Aún no hay recargas</h2>
          <p>Cuando registres ventas confirmadas, aquí verás cada cuánto compra cada cliente.</p>
        </div>
      ) : (
        <div className="glass-table">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Recargas</th>
                <th>Última recarga</th>
                <th>Cada cuánto</th>
                <th>Próxima recarga</th>
                <th>Estado</th>
                <th>Pago promedio</th>
                <th>Último pago</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length ? (
                visibles.map((item) => (
                  <tr key={item.clienteId}>
                    <td>
                      <strong>{item.cliente}</strong>
                      {item.telefono ? <small>{item.telefono}</small> : null}
                    </td>
                    <td>{item.compras}</td>
                    <td>
                      {fechaCorta(item.ultimaRecarga)}
                      <small>Hace {item.diasDesdeUltima} días</small>
                    </td>
                    <td>{item.intervaloDias !== null ? `${item.intervaloDias} días` : '—'}</td>
                    <td>{fechaCorta(item.proximaRecarga)}</td>
                    <td>
                      <span className={ESTADO_INFO[item.estado].clase}>
                        {ESTADO_INFO[item.estado].label}
                      </span>
                    </td>
                    <td>
                      <strong>{moneda(item.pagoPromedio)}</strong>
                    </td>
                    <td>{moneda(item.ultimoPago)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="table-empty">
                      <Search size={22} />
                      <span>No hay clientes que coincidan con los filtros.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setEstado('Todos');
                        }}
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
