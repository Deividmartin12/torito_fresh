'use client';

import { CalendarClock, Pencil, Plus, Search, X } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Pagination } from '../../../components/Pagination';

type Lote = {
  id: number;
  codigo: string;
  producto: string;
  produccion: string;
  vencimiento: string;
  costo: number;
  disponible: number;
  estado: 'ACTIVO' | 'VENCIDO' | 'AGOTADO' | 'BLOQUEADO';
};
const datos: Lote[] = [
  {
    id: 1,
    codigo: 'L-260710',
    producto: 'Agua purificada 20 L',
    produccion: '10/07/2026',
    vencimiento: '10/10/2026',
    costo: 4.8,
    disponible: 100,
    estado: 'ACTIVO',
  },
  {
    id: 2,
    codigo: 'L-260705',
    producto: 'Agua purificada 20 L',
    produccion: '05/07/2026',
    vencimiento: '05/10/2026',
    costo: 4.7,
    disponible: 25,
    estado: 'ACTIVO',
  },
  {
    id: 3,
    codigo: 'L-260401',
    producto: 'Agua purificada 10 L',
    produccion: '01/04/2026',
    vencimiento: '01/07/2026',
    costo: 3.1,
    disponible: 6,
    estado: 'VENCIDO',
  },
];

export default function LotesPage() {
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('Todos');
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Lote | null>(null);
  const lotes = useMemo(
    () =>
      datos.filter(
        (item) =>
          (estado === 'Todos' || item.estado === estado) &&
          `${item.codigo} ${item.producto}`.toLowerCase().includes(buscar.toLowerCase()),
      ),
    [buscar, estado],
  );
  const paginados = lotes.slice((pagina - 1) * pageSize, pagina * pageSize);
  function abrir(item?: Lote) {
    setEditando(item ?? null);
    setModal(true);
  }
  function guardar(event: FormEvent) {
    event.preventDefault();
    setModal(false);
  }
  return (
    <div className="module-page">
      <div className="module-head">
        <div className="module-title">
          <h1>Lotes</h1>
          <span>{datos.length} lotes</span>
        </div>
        <button
          className="round-add"
          onClick={() => abrir()}
          title="Agregar lote"
          aria-label="Agregar lote"
        >
          <Plus size={20} />
        </button>
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
        </select>
      </div>
      <div className="glass-table">
        <table>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Producto</th>
              <th>Produccion</th>
              <th>Vencimiento</th>
              <th>Costo unitario</th>
              <th>Disponible</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginados.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.codigo}</strong>
                </td>
                <td>{item.producto}</td>
                <td>{item.produccion}</td>
                <td>{item.vencimiento}</td>
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
                <td>
                  <div className="row-actions">
                    <button className="icon-soft" onClick={() => abrir(item)} title="Editar lote">
                      <Pencil size={16} />
                    </button>
                    <button className="icon-soft" title="Ver vencimiento">
                      <CalendarClock size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
      {modal ? (
        <div className="modal-backdrop">
          <section
            className="crud-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editando ? 'Editar lote' : 'Agregar lote'}
          >
            <div className="modal-top">
              <h2>{editando ? 'Editar lote' : 'Agregar lote'}</h2>
              <button
                className="modal-close"
                onClick={() => setModal(false)}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={guardar}>
              <label>
                <span>Producto</span>
                <select defaultValue={editando?.producto}>
                  <option>Agua purificada 20 L</option>
                  <option>Agua purificada 10 L</option>
                </select>
              </label>
              <label>
                <span>Codigo de lote</span>
                <input defaultValue={editando?.codigo} required />
              </label>
              <label>
                <span>Fecha de produccion</span>
                <input type="date" required />
              </label>
              <label>
                <span>Fecha de vencimiento</span>
                <input type="date" required />
              </label>
              <label>
                <span>Costo unitario</span>
                <input type="number" step="0.0001" defaultValue={editando?.costo} required />
              </label>
              <label>
                <span>Estado</span>
                <select defaultValue={editando?.estado ?? 'ACTIVO'}>
                  <option>ACTIVO</option>
                  <option>VENCIDO</option>
                  <option>AGOTADO</option>
                  <option>BLOQUEADO</option>
                </select>
              </label>
              <div className="modal-actions">
                <button className="btn-secondary" type="button" onClick={() => setModal(false)}>
                  Cancelar
                </button>
                <button className="btn-primary">
                  {editando ? 'Guardar cambios' : 'Registrar lote'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
