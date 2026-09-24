import { Plus } from 'lucide-react';
import { ButtonHTMLAttributes } from 'react';

type AddButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'children'> & {
  /** Título del botón: se usa como `title`/`aria-label`, y desde `tablet:` se ve como texto. */
  label: string;
};

/** El "+" circular de cabecera de cada listado. En móvil es solo el ícono; desde `tablet:`
 * se ensancha y muestra la etiqueta, para no depender de `title` + `content: attr()` en CSS. */
export function AddButton({ label, className = '', type = 'button', ...props }: AddButtonProps) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      className={`inline-flex h-[51px] w-[51px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-accent bg-accent px-0 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover hover:border-accent-hover tablet:w-auto tablet:min-w-[51px] tablet:px-[17px] tablet:transition-transform tablet:hover:-translate-y-px ${className}`.trim()}
      {...props}
    >
      <Plus size={20} className="shrink-0" />
      <span className="hidden tablet:inline">{label}</span>
    </button>
  );
}
