'use client';

import { Search, X } from 'lucide-react';
import { KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export type SearchableOption = {
  value: string;
  label: string;
  /** Dato extra que se muestra a la derecha de la opción (p. ej. "Disponible: 12").
   *  No entra en la búsqueda ni se ve en el campo una vez elegida la opción. */
  hint?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  /** Opción de acción fija al final del desplegable (p. ej. "+ Agregar cliente"). */
  actionLabel?: string;
  onAction?: () => void;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Buscar...',
  disabled,
  className = '',
  required,
  actionLabel,
  onAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  // El menú va con position: fixed y se ancla al control por coordenadas. Así no lo recorta
  // el contenedor de líneas de la venta, que ahora tiene scroll propio (overflow-y: auto).
  // `place` decide si se abre hacia abajo o hacia arriba según el espacio disponible.
  const [menuBox, setMenuBox] = useState<{
    left: number;
    width: number;
    place: 'below' | 'above';
    offset: number;
    maxHeight: number;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase()),
  );

  const selectOption = (option: SearchableOption) => {
    onChange(option.value);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (!filtered.length) return -1;
        if (event.key === 'ArrowDown') return current >= filtered.length - 1 ? 0 : current + 1;
        return current <= 0 ? filtered.length - 1 : current - 1;
      });
      return;
    }

    if (event.key === 'Enter' && open && activeIndex >= 0 && filtered[activeIndex]) {
      event.preventDefault();
      selectOption(filtered[activeIndex]);
    }
  };

  useEffect(() => {
    function close(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  // Mientras el menú está abierto, se mantiene pegado al control aunque se haga scroll o
  // cambie el tamaño de la ventana. El listener de scroll es en captura para oír también
  // el scroll de contenedores internos (la lista de productos de la venta).
  useLayoutEffect(() => {
    if (!open || disabled) {
      setMenuBox(null);
      return;
    }
    const gap = 5;
    const margin = 8;
    const reposition = () => {
      const rect = control.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
      const spaceAbove = rect.top - gap - margin;
      const above = spaceBelow < 180 && spaceAbove > spaceBelow;
      setMenuBox({
        left: rect.left,
        width: rect.width,
        place: above ? 'above' : 'below',
        offset: above ? window.innerHeight - rect.top + gap : rect.bottom + gap,
        maxHeight: Math.min(280, Math.max(above ? spaceAbove : spaceBelow, 120)),
      });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, disabled]);

  return (
    <div ref={root} className={`searchable-select ${className}`}>
      <div ref={control} className="searchable-select-control">
        <Search size={15} />
        <input
          ref={input}
          value={open ? query : (selected?.label ?? '')}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={selected ? undefined : placeholder}
          disabled={disabled}
          required={required && !value}
          aria-label={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !disabled}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        />
        {value ? (
          <button
            type="button"
            className="searchable-select-clear"
            onClick={() => {
              onChange('');
              setQuery('');
              setOpen(false);
              input.current?.focus();
            }}
            aria-label="Limpiar selección"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>
      {open && !disabled && menuBox ? (
        <div
          className="searchable-select-menu"
          id={listboxId}
          role="listbox"
          style={{
            position: 'fixed',
            left: menuBox.left,
            width: menuBox.width,
            right: 'auto',
            top: menuBox.place === 'below' ? menuBox.offset : 'auto',
            bottom: menuBox.place === 'above' ? menuBox.offset : 'auto',
            maxHeight: menuBox.maxHeight,
          }}
        >
          {filtered.length ? (
            filtered.map((option, index) => (
              <button
                type="button"
                id={`${listboxId}-${index}`}
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={option.value === value || index === activeIndex ? 'selected' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                <span>{option.label}</span>
                {option.hint ? (
                  <small className="searchable-select-hint">{option.hint}</small>
                ) : null}
              </button>
            ))
          ) : (
            <span className="searchable-select-empty" role="status">
              Sin resultados para “{query}”
            </span>
          )}
          {actionLabel && onAction ? (
            <button
              type="button"
              className="searchable-select-action"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onAction();
                setQuery('');
                setOpen(false);
                setActiveIndex(-1);
              }}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
