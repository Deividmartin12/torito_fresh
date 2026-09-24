import Link from 'next/link';

/** Sección del panel: un título, una acción opcional a la derecha y el contenido debajo. */
export function PanelCard({
  title,
  actionLabel,
  actionHref,
  children,
}: {
  title: string;
  actionLabel?: string;
  actionHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-3 rounded-container-lg border border-line bg-surface p-4">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="m-0 text-base text-fg">{title}</h2>
        {actionLabel && actionHref ? (
          <Link
            className="-my-3 -mx-1.5 inline-flex min-h-11 items-center px-1.5 py-3 text-[13px] font-semibold text-accent no-underline"
            href={actionHref}
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
