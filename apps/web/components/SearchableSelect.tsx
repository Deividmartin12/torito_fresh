"use client";

import { Search, X } from "lucide-react";
import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";

export type SearchableOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
};

export function SearchableSelect({ value, onChange, options, placeholder = "Buscar...", disabled, className = "", required }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));

  const selectOption = (option: SearchableOption) => {
    onChange(option.value);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (!filtered.length) return -1;
        if (event.key === "ArrowDown") return current >= filtered.length - 1 ? 0 : current + 1;
        return current <= 0 ? filtered.length - 1 : current - 1;
      });
      return;
    }

    if (event.key === "Enter" && open && activeIndex >= 0 && filtered[activeIndex]) {
      event.preventDefault();
      selectOption(filtered[activeIndex]);
    }
  };

  useEffect(() => {
    function close(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  return <div ref={root} className={`searchable-select ${className}`}>
    <div className="searchable-select-control">
      <Search size={15} />
      <input
        ref={input}
        value={open ? query : selected?.label ?? ""}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => { setQuery(""); setOpen(true); }}
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
      {value ? <button type="button" className="searchable-select-clear" onClick={() => { onChange(""); setQuery(""); setOpen(false); input.current?.focus(); }} aria-label="Limpiar selección"><X size={13} /></button> : null}
    </div>
    {open && !disabled ? <div className="searchable-select-menu" id={listboxId} role="listbox">
      {filtered.length ? filtered.map((option, index) => <button
        type="button"
        id={`${listboxId}-${index}`}
        key={option.value}
        role="option"
        aria-selected={option.value === value}
        className={option.value === value || index === activeIndex ? "selected" : ""}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => selectOption(option)}
      >{option.label}</button>) : <span className="searchable-select-empty" role="status">Sin resultados para “{query}”</span>}
    </div> : null}
  </div>;
}
