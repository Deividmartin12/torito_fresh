'use client';

import { Search, X } from 'lucide-react';
import { KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { normalizarBusqueda } from '../lib/format';

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
  /**
   * Opción fija que aparece siempre arriba de todo, incluso con el buscador vacío o sin
   * resultados (p. ej. "NO REGISTRADO" para una venta sin cliente). Nunca se filtra por el
   * texto tipeado y es alcanzable con el teclado como una fila más.
   */
  fixedOption?: SearchableOption;
};

// Filas por las que se mueve el teclado, de arriba hacia abajo: la opción fija (si hay),
// los resultados filtrados y la fila "+ Agregar" (si hay). Mouse y teclado comparten este
// mismo orden para que el resaltado sea uno solo.
type NavRow =
  | { kind: 'fixed'; option: SearchableOption }
  | { kind: 'result'; option: SearchableOption }
  | { kind: 'action' };

// Búsqueda remota con debounce: por ahora no hace falta. La app carga los catálogos por
// adelantado y las listas son chicas/medianas, así que el filtrado es local. Si alguna
// lista crece, la extensión sería agregar props `onSearch` / `loading` / `debounceMs`.

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
  fixedOption,
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

  const hasAction = Boolean(actionLabel && onAction);
  const selected =
    fixedOption && value === fixedOption.value
      ? fixedOption
      : options.find((option) => option.value === value);
  // La búsqueda ignora acentos y mayúsculas. Se matchea sólo `label` (el `hint` es un dato
  // numérico de apoyo, no un criterio de búsqueda).
  const q = normalizarBusqueda(query);
  const filtered = options.filter((option) => normalizarBusqueda(option.label).includes(q));

  const navRows: NavRow[] = [
    ...(fixedOption ? [{ kind: 'fixed' as const, option: fixedOption }] : []),
    ...filtered.map((option) => ({ kind: 'result' as const, option })),
    ...(hasAction ? [{ kind: 'action' as const }] : []),
  ];

  const selectOption = (option: SearchableOption) => {
    onChange(option.value);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  };

  const runAction = () => {
    onAction?.();
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  };

  const activateRow = (row: NavRow) => {
    if (row.kind === 'action') runAction();
    else selectOption(row.option);
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
        if (!navRows.length) return -1;
        if (event.key === 'ArrowDown') return current >= navRows.length - 1 ? 0 : current + 1;
        return current <= 0 ? navRows.length - 1 : current - 1;
      });
      return;
    }

    if (event.key === 'Enter' && open && activeIndex >= 0 && navRows[activeIndex]) {
      event.preventDefault();
      activateRow(navRows[activeIndex]);
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

  const fixedOffset = fixedOption ? 1 : 0;
  const actionIndex = hasAction ? fixedOffset + filtered.length : -1;

  const rowClass = (navIndex: number, isSelected: boolean) =>
    isSelected || navIndex === activeIndex ? 'selected' : '';

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
          {fixedOption ? (
            <>
              <button
                type="button"
                id={`${listboxId}-0`}
                role="option"
                aria-selected={fixedOption.value === value}
                className={`searchable-select-fixed ${rowClass(0, fixedOption.value === value)}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(0)}
                onClick={() => selectOption(fixedOption)}
              >
                <span>{fixedOption.label}</span>
                {fixedOption.hint ? (
                  <small className="searchable-select-hint">{fixedOption.hint}</small>
                ) : null}
              </button>
              <div className="searchable-select-separator" />
            </>
          ) : null}

          {filtered.length ? (
            filtered.map((option, index) => {
              const navIndex = fixedOffset + index;
              return (
                <button
                  type="button"
                  id={`${listboxId}-${navIndex}`}
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  className={rowClass(navIndex, option.value === value)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(navIndex)}
                  onClick={() => selectOption(option)}
                >
                  <span>{option.label}</span>
                  {option.hint ? (
                    <small className="searchable-select-hint">{option.hint}</small>
                  ) : null}
                </button>
              );
            })
          ) : (
            <span className="searchable-select-empty" role="status">
              No se encontraron resultados
            </span>
          )}

          {hasAction ? (
            // La fila de acción ya trae su propia línea divisoria (border-top en CSS).
            <button
              type="button"
              id={`${listboxId}-${actionIndex}`}
              className={`searchable-select-action ${rowClass(actionIndex, false)}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(actionIndex)}
              onClick={runAction}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
