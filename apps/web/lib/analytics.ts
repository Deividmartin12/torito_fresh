import { api } from './api';

export type AnalyticsPeriod = {
  key: string;
  label: string;
  sales: number;
  expenses: number;
  cost: number;
  margin: number;
  orders: number;
};
export type AnalyticsRanking = { id: string; name: string; value: number; count: number };
export type AnalyticsProduct = {
  id: string;
  name: string;
  quantity: number;
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

export type BusinessAnalytics = {
  range: { from: string; to: string };
  summary: {
    sales: number;
    expenses: number;
    cost: number;
    margin: number;
    marginRate: number;
    orders: number;
    ticket: number;
    expenseCount: number;
    averageExpense: number;
  };
  daily: AnalyticsPeriod[];
  monthly: AnalyticsPeriod[];
  topProducts: AnalyticsProduct[];
  zones: AnalyticsRanking[];
  topClients: AnalyticsRanking[];
  expenseCategories: AnalyticsRanking[];
  customerMix: { new: number; recurring: number };
  paymentMethods: { name: string; value: number }[];
  heatmap: HeatmapPoint[];
  lowStock: { id: string; name: string; available: number; minimum: number }[];
};

export function getBusinessAnalytics(from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return api<BusinessAnalytics>(`/reports/business${query.size ? `?${query}` : ''}`);
}

const localDateKey = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const dayLabelFormatter = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' });
const monthLabelFormatter = new Intl.DateTimeFormat('es-PE', { month: 'short', year: '2-digit' });

function emptyPeriod(key: string, label: string): AnalyticsPeriod {
  return { key, label, sales: 0, expenses: 0, cost: 0, margin: 0, orders: 0 };
}

/** Fills gaps so every calendar day in [from, to] gets a bar, even without sales/expenses that day. */
export function fillDailySeries(
  rows: AnalyticsPeriod[],
  from: string,
  to: string,
): AnalyticsPeriod[] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (!from || !to || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return rows;
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const filled: AnalyticsPeriod[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = localDateKey(cursor);
    filled.push(byKey.get(key) ?? emptyPeriod(key, dayLabelFormatter.format(cursor)));
  }
  return filled;
}

/** Fills gaps so every calendar month in [from, to] gets a bar, even without sales/expenses that month. */
export function fillMonthlySeries(
  rows: AnalyticsPeriod[],
  from: string,
  to: string,
): AnalyticsPeriod[] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (!from || !to || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return rows;
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const filled: AnalyticsPeriod[] = [];
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  for (const cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= last;) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    filled.push(byKey.get(key) ?? emptyPeriod(key, monthLabelFormatter.format(cursor)));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return filled;
}

/** Aggregates monthly buckets (key "YYYY-MM") into yearly totals for long custom ranges. */
export function groupPeriodsByYear(rows: AnalyticsPeriod[]): AnalyticsPeriod[] {
  const years = new Map<string, AnalyticsPeriod>();
  for (const row of rows) {
    const year = row.key.slice(0, 4);
    const current = years.get(year) ?? {
      key: year,
      label: year,
      sales: 0,
      expenses: 0,
      cost: 0,
      margin: 0,
      orders: 0,
    };
    current.sales += row.sales;
    current.expenses += row.expenses;
    current.cost += row.cost;
    current.margin += row.margin;
    current.orders += row.orders;
    years.set(year, current);
  }
  return [...years.values()].sort((a, b) => a.key.localeCompare(b.key));
}
