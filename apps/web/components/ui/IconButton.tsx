import { ButtonHTMLAttributes } from 'react';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `danger`: el hover pasa a rojo, para acciones destructivas (anular, eliminar). */
  tone?: 'default' | 'danger';
};

const hoverClass = {
  default: 'hover:bg-surface-hover hover:text-fg',
  danger: 'hover:bg-status-red-bg hover:text-status-red-text',
};

/** Botón de ícono sin fondo propio: fila de acciones de una tabla, cerrar un modal, etc. */
export function IconButton({
  className = '',
  type = 'button',
  tone = 'default',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`grid h-11 w-11 tablet:h-10 tablet:w-[42px] place-items-center rounded-lg border-0 bg-transparent text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${hoverClass[tone]} ${className}`.trim()}
      {...props}
    />
  );
}
