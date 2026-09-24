import { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
/** `pill`: el estándar (radio completo). `rect` (10px, 42px de alto): la que usan los
 * asistentes de operación (Nueva venta, Conteo...), donde el botón es una pieza más de
 * una barra de pasos y no un CTA aislado. */
export type ButtonShape = 'pill' | 'rect';

const shapeClass: Record<ButtonShape, string> = {
  pill: 'min-h-[46px] tablet:min-h-[39px] gap-1.5 rounded-full',
  rect: 'min-h-[42px] gap-[7px] rounded-[10px]',
};

const base =
  'inline-flex items-center justify-center px-4 text-xs tablet:text-[13px] font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'border border-accent bg-accent text-white hover:bg-accent-hover hover:border-accent-hover',
  secondary: 'border border-line bg-surface text-fg font-medium hover:bg-surface-hover',
  danger: 'border border-status-red-text bg-status-red-text text-white hover:brightness-[0.92]',
};

/** Clases del botón. Sirve para componerlo sobre cualquier elemento, como `<Link>`, que no
 * puede pasar por `<Button>`. */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  className = '',
  shape: ButtonShape = 'pill',
) {
  return `${base} ${shapeClass[shape]} ${variantClass[variant]} ${className}`.trim();
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  shape?: ButtonShape;
};

export function Button({
  variant = 'primary',
  shape = 'pill',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className, shape)} {...props} />;
}
