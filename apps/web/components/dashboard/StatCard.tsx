import Link from 'next/link';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Variacion } from '../../lib/format';
import { CifraAnimada } from '../ui/CifraAnimada';

export type StatTone = 'blue' | 'green' | 'amber' | 'red' | 'violet';

/**
 * Con `invertir`, subir es desfavorable y bajar favorable, como en los gastos.
 */
export function StatCard({
  icon,
  label,
  value,
  detail,
  tone,
  valueTone,
  change,
  changeCaption,
  href,
  invertir = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail?: string;
  tone: StatTone;
  valueTone?: 'green' | 'red';
  change?: Variacion;
  changeCaption?: string;
  href?: string;
  invertir?: boolean;
}) {
  const direccion = change && change.direccion !== 'na' ? change.direccion : 'flat';
  const sube = direccion === 'up';
  const baja = direccion === 'down';

  const esBueno = invertir ? baja : sube;
  const esMalo = invertir ? sube : baja;
  const ChangeIcon = sube ? TrendingUp : baja ? TrendingDown : null;

  const status = esBueno ? 'positive' : esMalo ? 'negative' : 'neutral';
  const statusLabel = esBueno
    ? 'Variación favorable'
    : esMalo
      ? 'Variación desfavorable'
      : change?.direccion === 'na'
        ? 'Sin base de comparación'
        : 'Sin variación';
  const caption = change?.texto.endsWith('%')
    ? (changeCaption ?? 'vs. el período anterior')
    : detail;
  const valueLength =
    typeof value === 'string' || typeof value === 'number' ? String(value).length : 8;
  const content = (
    <>
      <div className="stat-card-head">
        <span className="stat-card-label" title={detail}>
          {label}
        </span>
        <span className="stat-card-icon" aria-hidden="true">
          {icon}
        </span>
      </div>
      <strong
        className={`stat-card-value${valueTone ? ` stat-card-value-${valueTone}` : ''}`}
        style={{ '--stat-value-length': Math.max(valueLength, 1) } as CSSProperties}
      >
        <CifraAnimada valor={value} />
      </strong>
      {change || detail ? (
        <div className="stat-card-footer">
          {caption ? <span className="stat-card-caption">{caption}</span> : null}
          {change ? (
            <>
              <span className="stat-card-delta">{change.texto}</span>
              {ChangeIcon ? (
                <span
                  className={`stat-card-trend stat-card-trend-${status}`}
                  role="img"
                  aria-label={statusLabel}
                  title={statusLabel}
                >
                  <ChangeIcon size={16} aria-hidden="true" />
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const className = `stat-card stat-card-${tone}`;
  return href ? (
    <Link className={`${className} stat-card-link`} href={href}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}
