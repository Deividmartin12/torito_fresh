'use client';

import { X } from 'lucide-react';
import { ForwardedRef, forwardRef, MouseEvent, ReactNode } from 'react';

type ModalProps = {
  onClose: () => void;
  /** Mientras hay un guardado en curso: bloquea el cierre por click afuera. El botón de la
   *  "x" queda a criterio de quien arma el header (normalmente también deshabilitado). */
  closeDisabled?: boolean;
  children: ReactNode;
  /** Ancho del panel; el default (690px) sirve para la mayoría de los formularios. */
  className?: string;
};

/** El fondo oscurecido + el panel. Sin header propio: cada modal arma el suyo con
 *  `<ModalHeader>` (o uno a medida) como primer hijo, porque el contenido varía demasiado
 *  para forzarlo a un único layout. El `ref` cae en el `<section>`, para el puñado de modales
 *  que manejan foco/Escape/scroll-lock a mano (los destructivos, sobre todo). */
export const Modal = forwardRef(function Modal(
  { onClose, closeDisabled = false, children, className = '' }: ModalProps,
  ref: ForwardedRef<HTMLElement>,
) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-scrim p-4"
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`max-h-[calc(100vh-32px)] w-full max-w-[690px] overflow-y-auto rounded-container-lg border border-line bg-surface ${className}`.trim()}
      >
        {children}
      </section>
    </div>
  );
});

type ModalHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Etiqueta chica en mayúsculas arriba del título (p. ej. "Detalle del gasto"), como en las
   *  cabeceras de página. */
  eyebrow?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  closeLabel?: string;
};

/** Título + "x" de cierre, con la misma línea divisoria que separa el header del cuerpo. */
export function ModalHeader({
  title,
  subtitle,
  eyebrow,
  onClose,
  closeDisabled = false,
  closeLabel = 'Cerrar',
}: ModalHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-line px-[18px] py-4">
      <div>
        {eyebrow ? (
          <span className="block text-xs font-normal uppercase tracking-wider text-accent">
            {eyebrow}
          </span>
        ) : null}
        <h2 className="m-0 text-lg font-semibold text-fg">{title}</h2>
        {subtitle ? <small className="mt-0.5 block text-muted">{subtitle}</small> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={closeDisabled}
        aria-label={closeLabel}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-0 bg-transparent text-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
      >
        <X size={18} />
      </button>
    </div>
  );
}
