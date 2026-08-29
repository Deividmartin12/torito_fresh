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

// Keys are built in UTC so they match the backend's America/Lima calendar-day keys
// regardless of the viewer's browser timezone.
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

function emptyPeriod(key: string, label: string): AnalyticsPeriod {
  return { key, label, sales: 0, expenses: 0, cost: 0, margin: 0, orders: 0 };
}

/** Parses a `YYYY-MM-DD` string to a UTC-midnight Date without browser-timezone drift. */
function parseUtcDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

/** Fills gaps so every calendar day in [from, to] gets a bar, even without sales/expenses that day. */
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

/** Fills gaps so every calendar month in [from, to] gets a bar, even without sales/expenses that month. */
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
