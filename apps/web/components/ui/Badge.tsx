import { HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray';

const toneClass: Record<BadgeTone, string> = {
  green: 'bg-status-green-bg text-status-green-text',
  amber: 'bg-status-amber-bg text-status-amber-text',
  red: 'bg-status-red-bg text-status-red-text',
  blue: 'bg-status-blue-bg text-status-blue-text',
  gray: 'bg-status-gray-bg text-status-gray-text',
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  children: ReactNode;
  /** El puntito de color antes del texto es el default (como antes); un ícono ya trae su
   *  propia forma y no necesita el punto también. */
  dot?: boolean;
};

/** Chip de estado: "Activo", "Pendiente", "Confirmado"... el mismo look en toda la app. */
export function Badge({
  tone = 'gray',
  dot = true,
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-snug tablet:text-[13px] ${toneClass[tone]} ${className}`.trim()}
      {...props}
    >
      {dot ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
