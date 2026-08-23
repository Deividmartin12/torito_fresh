import { api } from "./api";

export type AnalyticsPeriod = { key: string; label: string; sales: number; expenses: number; cost: number; margin: number; orders: number };
export type AnalyticsRanking = { id: string; name: string; value: number; count: number };
export type AnalyticsProduct = { id: string; name: string; quantity: number; revenue: number; cost: number; margin: number };
export type HeatmapPoint = { day: number; dayLabel: string; hour: number; orders: number; sales: number };

export type BusinessAnalytics = {
  range: { from: string; to: string };
  summary: { sales: number; expenses: number; cost: number; margin: number; marginRate: number; orders: number; ticket: number; expenseCount: number; averageExpense: number };
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
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  return api<BusinessAnalytics>(`/reports/business${query.size ? `?${query}` : ""}`);
}
