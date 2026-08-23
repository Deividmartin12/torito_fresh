import { api } from "./api";
import { BusinessAnalytics, getBusinessAnalytics } from "./analytics";

export type DashboardMetrics = {
  salesToday: number;
  paidToday: number;
  debtToday: number;
  salesCountToday: number;
  pendingOrders: number;
  onRouteOrders: number;
  totalDebt: number;
  pendingContainers: number;
  fullJugStock: number;
  emptyContainerStock: number;
  activeClients: number;
};

export type PendingOrder = {
  id: string;
  orderedAt: string;
  status: string;
  total: number;
  client?: { id: string; name: string; address?: string; phone?: string };
  deliveryUser?: { id: string; name: string } | null;
  items?: { quantity: number; product?: { name: string } }[];
};

export type ContainerPendingClient = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  containerBalance: number;
};

export type SalesPeriodRow = { date: string; total: number; paid: number; debt: number; count: number };
export type TopProductRow = { product?: { id: string; name: string }; quantity: number; total: number };

export type BusinessDashboard = {
  metrics: DashboardMetrics;
  pendingOrders: PendingOrder[];
  containers: ContainerPendingClient[];
  analytics: BusinessAnalytics;
};

export async function getBusinessDashboard(): Promise<BusinessDashboard> {
  const [metrics, pendingOrders, containers, analytics] = await Promise.all([
    api<DashboardMetrics>("/reports/dashboard"),
    api<PendingOrder[]>("/reports/pending-orders"),
    api<ContainerPendingClient[]>("/reports/containers-pending"),
    getBusinessAnalytics(),
  ]);
  return { metrics, pendingOrders, containers, analytics };
}
