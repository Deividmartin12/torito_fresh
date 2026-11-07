'use client';

import { Maximize2, X } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '../ui/IconButton';

export function ChartExpansion({
  title,
  subtitle,
  legend,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <IconButton
        aria-label={`Ampliar gráfico: ${title}`}
        aria-haspopup="dialog"
        title="Ampliar gráfico"
        className="shrink-0"
        onClick={() => {
          dialog.current?.showModal();
          setExpanded(true);
        }}
      >
        <Maximize2 size={18} aria-hidden="true" />
      </IconButton>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="chart-dialog"
        onClose={() => setExpanded(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface p-4">
          <div>
            <h2 className="m-0 text-lg font-semibold text-fg" id={titleId}>
              {title}
            </h2>
            {subtitle ? <p className="m-0 mt-1 text-xs text-muted">{subtitle}</p> : null}
          </div>
          <IconButton
            aria-label="Cerrar gráfico ampliado"
            title="Cerrar gráfico ampliado"
            className="shrink-0"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </IconButton>
        </div>
        {expanded ? (
          <div className="chart-dialog-content">
            {legend ? <div className="mb-4">{legend}</div> : null}
            {children}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
