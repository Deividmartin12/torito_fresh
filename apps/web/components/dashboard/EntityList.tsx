import Link from 'next/link';
import { Badge } from '../ui/Badge';

export type EntityRowTone = 'blue' | 'green' | 'amber' | 'red' | 'gray';

export type EntityRow = {
  id: string;
  icon: React.ReactNode;
  tone?: EntityRowTone;
  title: string;
  meta: string;
  amount?: string;
  /** Chip de estado a la derecha, con las mismas clases `status-*` del resto de la app. */
  status?: { label: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'gray' };
  href?: string;
  onSelect?: () => void;
};

/**
 * Lista de filas con ícono, título, línea de contexto, monto y chip de estado. Es el reemplazo
 * de la tabla en las pantallas que se usan desde el celular todos los días: en 375px una tabla
 * de ocho columnas convertida en pares etiqueta/valor obliga a leer mucho para encontrar poco.
 */
export function EntityList({ rows, empty }: { rows: EntityRow[]; empty: string }) {
  if (!rows.length) return <div className="entity-list-empty">{empty}</div>;

  return (
    <div className="entity-list">
      {rows.map((row) => {
        const contenido = (
          <>
            <span className={`entity-row-icon entity-row-icon-${row.tone ?? 'blue'}`}>
              {row.icon}
            </span>
            <span className="entity-row-main">
              <span className="entity-row-title">{row.title}</span>
              <span className="entity-row-meta">{row.meta}</span>
            </span>
            <span className="entity-row-side">
              {row.amount ? <span className="entity-row-amount">{row.amount}</span> : null}
              {row.status ? <Badge tone={row.status.tone}>{row.status.label}</Badge> : null}
            </span>
          </>
        );

        if (row.href) {
          return (
            <Link className="entity-row" href={row.href} key={row.id}>
              {contenido}
            </Link>
          );
        }
        if (row.onSelect) {
          return (
            <button className="entity-row" type="button" key={row.id} onClick={row.onSelect}>
              {contenido}
            </button>
          );
        }
        return (
          <div className="entity-row" key={row.id}>
            {contenido}
          </div>
        );
      })}
    </div>
  );
}
