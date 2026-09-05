'use client';

import { BarChart3, Boxes, Minus, ShoppingCart, TrendingDown, TrendingUp, Truck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Variacion } from '../../lib/format';

const reports = [
  { href: '/reportes/resumen', label: 'Resumen', icon: BarChart3 },
  { href: '/reportes/ventas', label: 'Ventas', icon: ShoppingCart },
  { href: '/reportes/gastos', label: 'Gastos', icon: Truck },
  { href: '/reportes/stock', label: 'Stock actual', icon: Boxes },
];

export function ReportNav() {
  const pathname = usePathname();
  return (
    <nav className="report-nav" aria-label="Tipos de reporte">
      {reports.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={pathname === href ? 'active' : ''}>
          <Icon size={17} /> {label}
        </Link>
      ))}
    </nav>
  );
}

export function ReportHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <>
      <div className="report-page-head">
        <div>
          <span className="operation-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <ReportNav />
    </>
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
