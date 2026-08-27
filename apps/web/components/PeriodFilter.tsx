'use client';

import { useEffect, useState } from 'react';

export type PeriodKind = 'day' | 'week' | 'month' | 'custom';
type Period = PeriodKind;
const localDate = (date = new Date()) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const anchorLabel: Record<Exclude<Period, 'custom'>, string> = {
  day: 'Fecha',
  week: 'Semana de',
  month: 'Mes de',
};

function range(period: Exclude<Period, 'custom'>, anchor: string) {
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
  return { from: localDate(start), to: localDate(end) };
}

const formatRange = (from: string, to: string) => {
  const format = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString('es-PE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  return from === to ? format(from) : `${format(from)} — ${format(to)}`;
};

export function PeriodFilter({
  onChange,
  hideRangeHint = false,
}: {
  onChange: (from: string, to: string, meta: { period: PeriodKind; label: string }) => void;
  hideRangeHint?: boolean;
}) {
  const today = localDate();
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(today);
  const [from, setFrom] = useState(() => range('month', today).from);
  const [to, setTo] = useState(() => range('month', today).to);

  useEffect(() => {
    onChange(from, to, { period, label: formatRange(from, to) });
  }, [from, onChange, period, to]);

  function select(next: Period) {
    setPeriod(next);
    if (next !== 'custom') {
      const selected = range(next, anchor);
      setFrom(selected.from);
      setTo(selected.to);
    }
  }

  function changeAnchor(nextAnchor: string) {
    setAnchor(nextAnchor);
    if (period !== 'custom') {
      const selected = range(period, nextAnchor);
      setFrom(selected.from);
      setTo(selected.to);
    }
  }

  return (
    <div className="module-tools report-filters" aria-label="Filtro de período">
      <div className="report-period-shortcuts">
        <button
          type="button"
          className={period === 'day' ? 'active' : ''}
          onClick={() => select('day')}
        >
          Día
        </button>
        <button
          type="button"
          className={period === 'week' ? 'active' : ''}
          onClick={() => select('week')}
        >
          Semana
        </button>
        <button
          type="button"
          className={period === 'month' ? 'active' : ''}
          onClick={() => select('month')}
        >
          Mes
        </button>
        <button
          type="button"
          className={period === 'custom' ? 'active' : ''}
          onClick={() => select('custom')}
        >
          Personalizada
        </button>
      </div>
      {period === 'custom' ? (
        <>
          <label className="report-date-filter">
            <span>Desde</span>
            <input
              type="date"
              max={to || today}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="report-date-filter">
            <span>Hasta</span>
            <input
              type="date"
              min={from || undefined}
              max={today}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </>
      ) : (
        <label className="report-date-filter">
          <span>{anchorLabel[period]}</span>
          <input
            type="date"
            max={today}
            value={anchor}
            onChange={(event) => changeAnchor(event.target.value)}
          />
        </label>
      )}
      {!hideRangeHint && period !== 'custom' && period !== 'day' ? (
        <span className="report-range-hint">{formatRange(from, to)}</span>
      ) : null}
    </div>
  );
}
