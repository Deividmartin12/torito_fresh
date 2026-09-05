'use client';

import { CalendarClock, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pagination } from '../../../components/Pagination';
import { api } from '../../../lib/api';

type Lote = {
  id: string;
  codigo: string;
  producto: string;
  fechaProduccion: string | null;
  fechaVencimiento: string | null;
  costo: number;
  disponible: number;
  estado: 'ACTIVO' | 'VENCIDO' | 'AGOTADO' | 'BLOQUEADO';
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('es-PE') : '—';

export default function LotesPage() {
  const [datos, setDatos] = useState<Lote[]>([]);
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    api<Lote[]>('/operations/lots')
      .then(setDatos)
      .catch((cause) =>
        toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar los lotes'),
      );
  }, []);
  const lotes = useMemo(
    () =>
      datos.filter(
        (item) =>
          (estado === 'Todos' || item.estado === estado) &&
          `${item.codigo} ${item.producto}`.toLowerCase().includes(buscar.toLowerCase()),
      ),
    [buscar, datos, estado],
  );
  const paginados = lotes.slice((pagina - 1) * pageSize, pagina * pageSize);
  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Lotes</h1>
          <span>{datos.length} lotes</span>
        </div>
      </div>
      <div className="module-tools">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => {
              setBuscar(event.target.value);
              setPagina(1);
            }}
            placeholder="Buscar por lote o producto"
          />
        </label>
        <select
          className="filter-pill"
          value={estado}
          onChange={(event) => {
            setEstado(event.target.value);
            setPagina(1);
          }}
        >
          <option>Todos</option>
          <option>ACTIVO</option>
          <option>VENCIDO</option>
          <option>AGOTADO</option>
          <option>BLOQUEADO</option>
        </select>
      </div>
      <div className="glass-table">
        <table>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Producto</th>
              <th>Producción</th>
              <th>Vencimiento</th>
              <th>Costo unitario</th>
              <th>Disponible</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {paginados.length ? (
              paginados.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.codigo}</strong>
                  </td>
                  <td>{item.producto}</td>
                  <td>{formatDate(item.fechaProduccion)}</td>
                  <td>{formatDate(item.fechaVencimiento)}</td>
                  <td>S/ {item.costo.toFixed(4)}</td>
                  <td>{item.disponible}</td>
                  <td>
                    <span
                      className={
                        item.estado === 'ACTIVO' ? 'status status-green' : 'status status-red'
                      }
                    >
                      {item.estado}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="table-empty">
                    <CalendarClock size={22} />
                    <span>Aún no hay lotes. Se generan automáticamente al registrar producción.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={pagina}
        pages={Math.max(1, Math.ceil(lotes.length / pageSize))}
        total={lotes.length}
        pageSize={pageSize}
        onChange={setPagina}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPagina(1);
        }}
      />
    </div>
  );
}
