import type { PeriodKind } from '../components/PeriodFilter';
import {
  AnalyticsPeriod,
  BusinessAnalytics,
  addInto,
  emptyPeriod,
  fillDailySeries,
  fillHourlySeries,
  fillMonthlySeries,
  groupPeriodsByYear,
  parseUtcDay,
} from './analytics';

/** Granularidad del eje X: cada período del filtro tiene la suya. */
export type AxisGranularity = 'hour3' | 'day' | 'week' | 'month' | 'year';

/**
 * Una marca del eje X ya resuelta: la fila del período más los textos con los que se dibuja.
 * `labelTop` es la línea de arriba (el nombre del día, el número de semana) y es la que se
 * esconde cuando la tarjeta del gráfico se hace angosta; `label` es la que siempre queda.
 */
export type ChartPoint = AnalyticsPeriod & {
  labelTop?: string;
  tooltip: string;
};

export const axisCaption: Record<AxisGranularity, string> = {
  hour3: 'cada 3 horas',
  day: 'por día',
  week: 'por semana',
  month: 'por mes',
  year: 'por año',
};

const pad = (value: number) => String(value).padStart(2, '0');
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

// Todas las claves de la serie son días/horas de calendario, así que se formatean en UTC para
// que el navegador no las corra un día, igual que hace `analytics.ts`.
const weekdayLong = new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'long' });
const dayMonthLong = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
});
const monthShort = new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', month: 'short' });
const monthLong = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

const spanDays = (from: string, to: string) => {
  const start = parseUtcDay(from);
  const end = parseUtcDay(to);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
};

/**
 * Granularidad que le toca al eje X según el período elegido: un día se lee por tramos de horas,
 * una semana por días, un mes por semanas y un año por meses. En "Personalizado" se decide por
 * el largo del rango, con los mismos cortes.
 */
export function pickAxis(period: PeriodKind, from: string, to: string): AxisGranularity {
  if (period === 'day') return 'hour3';
  if (period === 'week') return 'day';
  if (period === 'month') return 'week';
  if (period === 'year') return 'month';
  const days = spanDays(from, to);
  if (days <= 2) return 'hour3';
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  if (days <= 1096) return 'month';
  return 'year';
}

/** Tramos de tres horas: 00:00, 03:00, ... 21:00. */
function hourSeries(rows: AnalyticsPeriod[], from: string, to: string): ChartPoint[] {
  const buckets = new Map<string, ChartPoint>();
  for (const row of fillHourlySeries(rows, from, to)) {
    const day = row.key.slice(0, 10);
    const start = Math.floor(Number(row.key.slice(11, 13)) / 3) * 3;
    const key = `${day}T${pad(start)}`;
    const current: ChartPoint = buckets.get(key) ?? {
      ...emptyPeriod(key, `${pad(start)}:00`),
      tooltip: `${pad(start)}:00 a ${pad(start + 3)}:00`,
    };
    addInto(current, row);
    buckets.set(key, current);
  }
  const points = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  // Con un rango de dos días los tramos se repiten, así que la línea de arriba dice de qué día es.
  if (new Set(points.map((point) => point.key.slice(0, 10))).size <= 1) return points;
  return points.map((point) => {
    const date = parseUtcDay(point.key.slice(0, 10));
    return {
      ...point,
      labelTop: `${point.key.slice(8, 10)}/${point.key.slice(5, 7)}`,
      tooltip: date ? `${dayMonthLong.format(date)}, ${point.tooltip}` : point.tooltip,
    };
  });
}

/** Un día por marca: nombre completo del día arriba y la fecha abajo. */
function daySeries(rows: AnalyticsPeriod[], from: string, to: string): ChartPoint[] {
  return fillDailySeries(rows, from, to).map((row) => {
    const date = parseUtcDay(row.key);
    const weekday = date ? capitalize(weekdayLong.format(date)) : '';
    return {
      ...row,
      label: `${row.key.slice(8, 10)}/${row.key.slice(5, 7)}`,
      labelTop: weekday || undefined,
      tooltip: date ? `${weekday} ${dayMonthLong.format(date)}` : row.label,
    };
  });
}

/**
 * Semanas reales de lunes a domingo, recortadas al rango: las de los extremos del mes quedan
 * incompletas (el mes muestra así sus 5 o 6 semanas). La marca dice "Sem. N" sobre los días.
 */
function weekSeries(rows: AnalyticsPeriod[], from: string, to: string): ChartPoint[] {
  const weeks = new Map<string, { point: ChartPoint; first: Date; last: Date }>();
  for (const row of fillDailySeries(rows, from, to)) {
    const date = parseUtcDay(row.key);
    if (!date) continue;
    // getUTCDay(): 0=domingo..6=sabado. Retrocede al lunes de esa semana.
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const week = weeks.get(key) ?? {
      point: { ...emptyPeriod(key, ''), tooltip: '' },
      first: date,
      last: date,
    };
    addInto(week.point, row);
    if (date < week.first) week.first = date;
    if (date > week.last) week.last = date;
    weeks.set(key, week);
  }
  return [...weeks.values()]
    .sort((a, b) => a.point.key.localeCompare(b.point.key))
    .map((week, index) => ({
      ...week.point,
      label: `${pad(week.first.getUTCDate())}-${pad(week.last.getUTCDate())}`,
      labelTop: `Sem. ${index + 1}`,
      tooltip: `Semana ${index + 1} · ${dayMonthLong.format(week.first)} al ${dayMonthLong.format(
        week.last,
      )}`,
    }));
}

/** Un mes por marca, con el nombre del mes abreviado (no la fecha). */
function monthSeries(rows: AnalyticsPeriod[], from: string, to: string): ChartPoint[] {
  const filled = fillMonthlySeries(rows, from, to);
  const multiYear = new Set(filled.map((row) => row.key.slice(0, 4))).size > 1;
  return filled.map((row) => {
    const date = parseUtcDay(`${row.key}-01`);
    return {
      ...row,
      // Nombre del mes abreviado y en minúscula ("ene", "set"): el punto y las mayúsculas
      // dependen del ICU del navegador, así que se normalizan para que el eje se vea igual.
      label: date ? monthShort.format(date).replace('.', '').toLowerCase() : row.label,
      labelTop: multiYear ? row.key.slice(0, 4) : undefined,
      tooltip: date ? capitalize(monthLong.format(date)) : row.label,
    };
  });
}

/**
 * Serie lista para los gráficos con eje de tiempo: elige la fuente que corresponde, rellena los
 * huecos y escribe las etiquetas del eje. Devuelve vacío mientras el filtro no publicó su rango.
 */
export function buildChartSeries(
  analytics: BusinessAnalytics | null,
  from: string,
  to: string,
  axis: AxisGranularity,
): ChartPoint[] {
  if (!from || !to) return [];
  switch (axis) {
    case 'hour3':
      return hourSeries(analytics?.hourly ?? [], from, to);
    case 'day':
      return daySeries(analytics?.daily ?? [], from, to);
    case 'week':
      return weekSeries(analytics?.daily ?? [], from, to);
    case 'month':
      return monthSeries(analytics?.monthly ?? [], from, to);
    case 'year':
      return groupPeriodsByYear(analytics?.monthly ?? []).map((row) => ({
        ...row,
        tooltip: `Año ${row.key}`,
      }));
  }
}
