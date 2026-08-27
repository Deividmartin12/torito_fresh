import { BusinessAnalytics, getBusinessAnalytics } from './analytics';

export type SalesPeriodRow = {
  date: string;
  total: number;
  paid: number;
  debt: number;
  count: number;
};
export type TopProductRow = {
  product?: { id: string; name: string };
  quantity: number;
  total: number;
};

export type BusinessDashboard = {
  analytics: BusinessAnalytics;
};

export async function getBusinessDashboard(from?: string, to?: string): Promise<BusinessDashboard> {
  return { analytics: await getBusinessAnalytics(from, to) };
}
