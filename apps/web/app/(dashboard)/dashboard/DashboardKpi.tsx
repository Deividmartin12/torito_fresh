import Link from 'next/link';

/** Tarjeta de indicador reutilizada por el panel de negocio y el del repartidor. */
export function DashboardKpi({
  icon,
  label,
  value,
  detail,
  tone,
  href,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  detail: string;
  tone: string;
  href?: string;
}) {
  const content = (
    <>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </>
  );
  const className = `dashboard-kpi dashboard-kpi-${tone}`;
  return href ? (
    <Link className={`${className} dashboard-kpi-link`} href={href}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}
