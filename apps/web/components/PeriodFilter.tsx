'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Segmented } from './Segmented';

export type PeriodKind = 'day' | 'week' | 'month' | 'year' | 'custom';
type Period = PeriodKind;
type FixedPeriod = Exclude<Period, 'custom'>;

const localDate = (date = new Date()) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const asDate = (value: string) => new Date(`${value}T00:00:00`);

const stepLabel: Record<FixedPeriod, [string, string]> = {
  day: ['Día anterior', 'Día siguiente'],
  week: ['Semana anterior', 'Semana siguiente'],
  month: ['Mes anterior', 'Mes siguiente'],
  year: ['Año anterior', 'Año siguiente'],
};

function range(period: FixedPeriod, anchor: string) {
  const start = new Date(`${anchor}T00:00:00`);
  const end = new Date(start);
  if (period === 'week') {
    const weekday = start.getDay();
    start.setDate(start.getDate() + (weekday === 0 ? -6 : 1 - weekday));
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  }
  if (period === 'month') {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  }
  if (period === 'year') {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }
  return { from: localDate(start), to: localDate(end) };
}

/** Mueve el ancla un período completo. Se parte del inicio del período y no del ancla cruda,
 * para que "31 de enero + 1 mes" caiga en febrero en vez de desbordarse a marzo. */
function shiftAnchor(period: FixedPeriod, anchor: string, delta: number) {
  const start = asDate(range(period, anchor).from);
  if (period === 'day') start.setDate(start.getDate() + delta);
  if (period === 'week') start.setDate(start.getDate() + delta * 7);
  if (period === 'month') start.setMonth(start.getMonth() + delta);
  if (period === 'year') start.setFullYear(start.getFullYear() + delta);
  return localDate(start);
}

/** El período siguiente solo se habilita mientras no empiece después de hoy. */
const canGoNext = (period: FixedPeriod, anchor: string) =>
  range(period, shiftAnchor(period, anchor, 1)).from <= localDate();

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const fullDate = (value: string) =>
  capitalize(
    new Intl.DateTimeFormat('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
      .format(asDate(value))
      .replace(',', ''),
  );

const dayMonth = (value: string, withYear = false) =>
  new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(asDate(value));

/** Texto humano del período activo, para mostrarlo como título en la pantalla:
 * "Martes 9 de septiembre de 2026", "Septiembre de 2026", "Año 2026",
 * "Semana del 8 al 14 de septiembre de 2026", "Del 3 al 17 de septiembre de 2026". */
function periodLabel(period: PeriodKind, from: string, to: string) {
  if (period === 'day' || from === to) return fullDate(from);
  if (period === 'month')
    return capitalize(
      new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(asDate(from)),
    );
  if (period === 'year') return `Año ${asDate(from).getFullYear()}`;
  const start = asDate(from);
  const end = asDate(to);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const left = sameMonth ? `${start.getDate()}` : dayMonth(from, !sameYear);
  const prefix = period === 'week' ? 'Semana del' : 'Del';
  return `${prefix} ${left} al ${dayMonth(to, true)}`;
}

const shortcuts: { value: Period; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
  { value: 'custom', label: 'Personalizado' },
];

/**
 * Barra única de filtro de fechas: el control segmentado a la izquierda y, tras un divisor, el
 * navegador de flechas con la etiqueta completa del período. Las flechas mueven un período
 * entero, la etiqueta abre un popover para saltar a otra fecha y "Personalizado" cambia ese
 * popover por el par Desde/Hasta.
 */
export function PeriodFilter({
  onChange,
  defaultPeriod = 'week',
}: {
  onChange: (from: string, to: string, meta: { period: PeriodKind; label: string }) => void;
  /** Período seleccionado al montar el componente. */
  defaultPeriod?: FixedPeriod;
}) {
  const today = localDate();
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [anchor, setAnchor] = useState(today);
  const [from, setFrom] = useState(() => range(defaultPeriod, today).from);
  const [to, setTo] = useState(() => range(defaultPeriod, today).to);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState(() => range(defaultPeriod, today));
  const label = periodLabel(period, from, to);
  const fixed = period === 'custom' ? null : period;

  useEffect(() => {
    onChange(from, to, { period, label });
  }, [from, label, onChange, period, to]);

  // En móvil el riel se desplaza en horizontal, así que el segmento activo se trae a la vista.
  useEffect(() => {
    rail.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [period]);

  // El popover se cierra al hacer clic fuera o con Escape, igual que el menú de SearchableSelect.
  useEffect(() => {
    if (!pickerOpen) return;
    function closeOutside(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setPickerOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [pickerOpen]);

  function applyAnchor(nextAnchor: string, nextPeriod: FixedPeriod) {
    const selected = range(nextPeriod, nextAnchor);
    setAnchor(nextAnchor);
    setFrom(selected.from);
    setTo(selected.to);
  }

  function select(next: Period) {
    setPeriod(next);
    setPickerOpen(false);
    if (next === 'custom') setDraft({ from, to });
    else applyAnchor(anchor, next);
  }

  function jump(nextAnchor: string) {
    if (!fixed || !nextAnchor) return;
    applyAnchor(nextAnchor, fixed);
    setPickerOpen(false);
  }

  const customReady = Boolean(draft.from && draft.to && draft.from <= draft.to);
  function applyCustom() {
    if (!customReady) return;
    setFrom(draft.from);
    setTo(draft.to);
    setPickerOpen(false);
  }

  // Últimos diez años, más el año del ancla si las flechas ya lo llevaron más atrás.
  const currentYear = new Date().getFullYear();
  const years = [
    ...new Set([
      ...Array.from({ length: 10 }, (_, index) => currentYear - index),
      Number(anchor.slice(0, 4)),
    ]),
  ].sort((a, b) => b - a);

  return (
    <div className="period-filter" ref={root} aria-label="Filtro de período">
      {/* El riel se desplaza en horizontal en pantallas angostas: si se lo comprime, los
          segmentos dejan de medir lo mismo y la pastilla deslizante queda descuadrada. */}
      <div className="period-filter-rail" ref={rail}>
        <Segmented
          ariaLabel="Período"
          value={period}
          onChange={(next) => select(next as Period)}
          options={shortcuts}
        />
      </div>
      <span className="period-filter-sep" aria-hidden />
      <div className="period-nav">
        {fixed ? (
          <button
            type="button"
            className="period-nav-arrow"
            aria-label={stepLabel[fixed][0]}
            onClick={() => applyAnchor(shiftAnchor(fixed, anchor, -1), fixed)}
          >
            <ChevronLeft size={17} />
          </button>
        ) : null}
        <button
          type="button"
          className="period-nav-label"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
        >
          {label}
        </button>
        {fixed ? (
          <button
            type="button"
            className="period-nav-arrow"
            aria-label={stepLabel[fixed][1]}
            disabled={!canGoNext(fixed, anchor)}
            onClick={() => applyAnchor(shiftAnchor(fixed, anchor, 1), fixed)}
          >
            <ChevronRight size={17} />
          </button>
        ) : null}

        {pickerOpen ? (
          <div className="period-popover" role="dialog" aria-label="Elegir período">
            {fixed === 'year' ? (
              <label className="period-popover-field">
                <span>Año</span>
                <select
                  value={anchor.slice(0, 4)}
                  onChange={(event) => jump(`${event.target.value}-01-01`)}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            ) : fixed === 'month' ? (
              <label className="period-popover-field">
                <span>Mes</span>
                <input
                  type="month"
                  max={today.slice(0, 7)}
                  value={anchor.slice(0, 7)}
                  onChange={(event) => jump(`${event.target.value}-01`)}
                />
              </label>
            ) : fixed ? (
              <label className="period-popover-field">
                <span>{fixed === 'week' ? 'Un día de la semana' : 'Fecha'}</span>
                <input
                  type="date"
                  max={today}
                  value={anchor}
                  onChange={(event) => jump(event.target.value)}
                />
              </label>
            ) : (
              <>
                <label className="period-popover-field">
                  <span>Desde</span>
                  <input
                    type="date"
                    max={draft.to || today}
                    value={draft.from}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, from: event.target.value }))
                    }
                  />
                </label>
                <label className="period-popover-field">
                  <span>Hasta</span>
                  <input
                    type="date"
                    min={draft.from || undefined}
                    max={today}
                    value={draft.to}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, to: event.target.value }))
                    }
                  />
                </label>
              </>
            )}

            <div className="period-popover-actions">
              {fixed ? (
                <button type="button" className="btn-secondary" onClick={() => jump(today)}>
                  Hoy
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!customReady}
                  onClick={applyCustom}
                >
                  Aplicar
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
