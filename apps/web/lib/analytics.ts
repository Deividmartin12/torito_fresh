import { api } from './api';

export type AnalyticsPeriod = {
  key: string;
  label: string;
  sales: number;
  expenses: number;
  cost: number;
  margin: number;
  orders: number;
  production: number;
};
export type AnalyticsRanking = { id: string; name: string; value: number; count: number };
export type AnalyticsProduct = {
  id: string;
  name: string;
  cantidad: number;
  revenue: number;
  cost: number;
  margin: number;
};
export type HeatmapPoint = {
  day: number;
  dayLabel: string;
  hour: number;
  orders: number;
  sales: number;
};

export type ReceivablesSummary = {
  total: number;
  count: number;
  overdue: number;
  overdueCount: number;
};

export type BusinessAnalytics = {
  range: { from: string; to: string };
  receivables: ReceivablesSummary;
  summary: {
    sales: number;
    expenses: number;
    cost: number;
    margin: number;
    marginRate: number;
    profit: number;
    profitRate: number;
    orders: number;
    ticket: number;
    expenseCount: number;
    averageExpense: number;
  };
  /** Serie por hora del día filtrado. El backend solo la calcula cuando el rango es un solo día. */
  hourly: AnalyticsPeriod[];
  daily: AnalyticsPeriod[];
  monthly: AnalyticsPeriod[];
  topProducts: AnalyticsProduct[];
  zones: AnalyticsRanking[];
  topClients: AnalyticsRanking[];
  expenseCategories: AnalyticsRanking[];
  heatmap: HeatmapPoint[];
  lowStock: { id: string; name: string; available: number; minimum: number }[];
};

export function getBusinessAnalytics(from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return api<BusinessAnalytics>(`/reports/business${query.size ? `?${query}` : ''}`);
}

// Las claves se arman en UTC para que coincidan con las claves de día calendario
// (America/Lima) que manda el backend, sin importar la zona horaria del navegador.
const dayLabelFormatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
});
const monthLabelFormatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'UTC',
  month: 'short',
  year: '2-digit',
});

const weekdayLabelFormatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'UTC',
  weekday: 'short',
  day: '2-digit',
});
const monthFormatter = new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', month: 'short' });
/** Mes corto en minúsculas y sin punto (`set`), como se rotulan los ejes del resto de gráficos. */
const shortMonth = (date: Date) => monthFormatter.format(date).replace('.', '').toLowerCase();

function emptyPeriod(key: string, label: string): AnalyticsPeriod {
  return { key, label, sales: 0, expenses: 0, cost: 0, margin: 0, orders: 0, production: 0 };
}

/** Convierte un texto `YYYY-MM-DD` en una fecha a medianoche UTC, sin desfase por zona horaria. */
function parseUtcDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

/** Rellena los huecos para que cada día de [from, to] tenga barra, aunque ese día no haya movimiento. */
export function fillDailySeries(
  rows: AnalyticsPeriod[],
  from: string,
  to: string,
): AnalyticsPeriod[] {
  const start = parseUtcDay(from);
  const end = parseUtcDay(to);
  if (!start || !end || start > end) return rows;
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const filled: AnalyticsPeriod[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10);
    filled.push(byKey.get(key) ?? emptyPeriod(key, dayLabelFormatter.format(cursor)));
  }
  return filled;
}

/**
 * Rellena las 24 horas del día `day` (`YYYY-MM-DD`) para que el eje X del filtro "Día" tenga
 * un punto por hora, aunque a esa hora no se haya movido nada.
 */
export function fillHourlySeries(rows: AnalyticsPeriod[], day: string): AnalyticsPeriod[] {
  if (!parseUtcDay(day)) return rows;
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return Array.from({ length: 24 }, (_, hour) => {
    const key = `${day}T${String(hour).padStart(2, '0')}`;
    return byKey.get(key) ?? emptyPeriod(key, `${String(hour).padStart(2, '0')}:00`);
  });
}

/** Etiqueta corta de día con su nombre (`lun 07`), para el eje X de la vista semanal. */
export function withWeekdayLabels(rows: AnalyticsPeriod[]): AnalyticsPeriod[] {
  return rows.map((row) => {
    const date = parseUtcDay(row.key);
    if (!date) return row;
    return { ...row, label: weekdayLabelFormatter.format(date).replace('.', '') };
  });
}

/** Rellena los huecos para que cada mes de [from, to] tenga barra, aunque ese mes no haya movimiento. */
export function fillMonthlySeries(
  rows: AnalyticsPeriod[],
  from: string,
  to: string,
): AnalyticsPeriod[] {
  const start = parseUtcDay(from);
  const end = parseUtcDay(to);
  if (!start || !end || start > end) return rows;
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const filled: AnalyticsPeriod[] = [];
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  for (
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    cursor <= last;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  ) {
    const key = cursor.toISOString().slice(0, 7);
    filled.push(byKey.get(key) ?? emptyPeriod(key, monthLabelFormatter.format(cursor)));
  }
  return filled;
}

/** Agrupa los meses (clave "YYYY-MM") en totales por año, para rangos personalizados largos. */
export function groupPeriodsByYear(rows: AnalyticsPeriod[]): AnalyticsPeriod[] {
  const years = new Map<string, AnalyticsPeriod>();
  for (const row of rows) {
    const year = row.key.slice(0, 4);
    const current = years.get(year) ?? emptyPeriod(year, year);
    current.sales += row.sales;
    current.expenses += row.expenses;
    current.cost += row.cost;
    current.margin += row.margin;
    current.orders += row.orders;
    current.production += row.production;
    years.set(year, current);
  }
  return [...years.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Agrupa filas diarias (ya rellenadas con `fillDailySeries`) en semanas de lunes a domingo.
 * La clave de cada semana es el lunes correspondiente (`YYYY-MM-DD`), y la etiqueta muestra
 * ese lunes como referencia de la semana.
 */
export function groupPeriodsByWeek(
  rows: AnalyticsPeriod[],
  labelMode: 'largo' | 'compacto' = 'largo',
): AnalyticsPeriod[] {
  const weeks = new Map<string, AnalyticsPeriod>();
  const boundsByKey = new Map<string, { first: Date; last: Date }>();
  for (const row of rows) {
    const date = parseUtcDay(row.key);
    if (!date) continue;
    // getUTCDay(): 0=domingo..6=sabado. Retrocede hasta el lunes de esa semana.
    const isoWeekday = (date.getUTCDay() + 6) % 7; // 0=lunes..6=domingo
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - isoWeekday);
    const key = monday.toISOString().slice(0, 10);
    // Extremos reales de la semana dentro del rango filtrado: así la etiqueta compacta de la
    // primera y la última semana del mes muestra los días que de verdad entran (ej. "29-31 ago").
    const bounds = boundsByKey.get(key);
    if (!bounds) boundsByKey.set(key, { first: date, last: date });
    else if (date < bounds.first) bounds.first = date;
    else if (date > bounds.last) bounds.last = date;
    const current = weeks.get(key) ?? emptyPeriod(key, `Sem. ${dayLabelFormatter.format(monday)}`);
    current.sales += row.sales;
    current.expenses += row.expenses;
    current.cost += row.cost;
    current.margin += row.margin;
    current.orders += row.orders;
    current.production += row.production;
    weeks.set(key, current);
  }
  const ordered = [...weeks.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (labelMode === 'largo') return ordered;
  return ordered.map((week) => {
    const bounds = boundsByKey.get(week.key);
    if (!bounds) return week;
    const first = bounds.first.getUTCDate();
    const last = bounds.last.getUTCDate();
    const firstMonth = shortMonth(bounds.first);
    const lastMonth = shortMonth(bounds.last);
    if (first === last) return { ...week, label: `${first} ${lastMonth}` };
    // Una semana a caballo entre dos meses lleva el mes en ambos extremos, para que
    // "31 ago-6 set" no se lea como si los 31 fueran de setiembre.
    const label =
      firstMonth === lastMonth
        ? `${first}-${last} ${lastMonth}`
        : `${first} ${firstMonth}-${last} ${lastMonth}`;
    return { ...week, label };
  });
}

/**
 * Rango de igual duración inmediatamente anterior a [from, to], para comparar KPIs contra
 * el período comparativo (ver skill reportes-comerciales: nunca mostrar un valor sin contexto).
 */
export function previousPeriodRange(from: string, to: string): { from: string; to: string } {
  const start = parseUtcDay(from);
  const end = parseUtcDay(to);
  if (!start || !end || start > end) return { from, to };
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (spanDays - 1));
  return {
    from: previousStart.toISOString().slice(0, 10),
    to: previousEnd.toISOString().slice(0, 10),
  };
}
