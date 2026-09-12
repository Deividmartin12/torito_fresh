'use client';

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Variacion } from '../../lib/format';

export function ReportHeader({
  eyebrow,
  title,
  caption,
}: {
  eyebrow: string;
  title: string;
  /** Período activo, escrito completo ("Septiembre de 2026"), para que se lea de un vistazo
   *  con qué filtro está armado el reporte. */
  caption?: string;
}) {
  return (
    <div className="report-page-head">
      <div>
        <span className="operation-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {caption ? <p className="operation-period-caption">{caption}</p> : null}
      </div>
    </div>
  );
}

const changeIcon = { up: TrendingUp, down: TrendingDown, flat: Minus, na: Minus };

export function ReportMetric({
  label,
  value,
  detail,
  change,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  /** Variación vs. el período comparativo. Se omite mientras el dato aún no llega. */
  change?: Variacion;
}) {
  const ChangeIcon = change ? changeIcon[change.direccion] : null;
  return (
    <article className="report-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      {change ? (
        <small className={`report-metric-change report-metric-change-${change.direccion}`}>
          {ChangeIcon ? <ChangeIcon size={13} /> : null}
          {change.texto} vs. período anterior
        </small>
      ) : null}
    </article>
  );
}
