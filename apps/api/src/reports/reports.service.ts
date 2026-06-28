import { Injectable } from "@nestjs/common";
import { OrderStatus, ProductCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [
      salesToday,
      pendingOrders,
      onRouteOrders,
      totalDebt,
      pendingContainers,
      fullStock,
      activeClients,
      warehouse,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { issuedAt: { gte: start, lt: end } },
        _sum: { totalAmount: true, paidAmount: true, debtAmount: true },
        _count: true,
      }),
      this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      this.prisma.order.count({ where: { status: OrderStatus.ON_ROUTE } }),
      this.prisma.client.aggregate({ _sum: { debtBalance: true } }),
      this.prisma.client.aggregate({
        where: { containerBalance: { gt: 0 } },
        _sum: { containerBalance: true },
      }),
      this.prisma.product.aggregate({
        where: { category: ProductCategory.WATER, returnable: true, active: true },
        _sum: { stock: true },
      }),
      this.prisma.client.count({ where: { active: true } }),
      this.prisma.warehouseState.upsert({
        where: { id: "main" },
        update: {},
        create: { id: "main", emptyContainers: 0 },
      }),
    ]);

    return {
      salesToday: Number(salesToday._sum.totalAmount ?? 0),
      paidToday: Number(salesToday._sum.paidAmount ?? 0),
      debtToday: Number(salesToday._sum.debtAmount ?? 0),
      salesCountToday: salesToday._count,
      pendingOrders,
      onRouteOrders,
      totalDebt: Number(totalDebt._sum.debtBalance ?? 0),
      pendingContainers: pendingContainers._sum.containerBalance ?? 0,
      fullJugStock: fullStock._sum.stock ?? 0,
      emptyContainerStock: warehouse.emptyContainers,
      activeClients,
    };
  }

  async salesByPeriod(from?: string, to?: string) {
    const sales = await this.prisma.sale.findMany({
      where: {
        ...(from || to
          ? {
              issuedAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { issuedAt: "asc" },
    });

    const buckets = new Map<string, { date: string; total: number; paid: number; debt: number; count: number }>();
    for (const sale of sales) {
      const date = sale.issuedAt.toISOString().slice(0, 10);
      const bucket = buckets.get(date) ?? { date, total: 0, paid: 0, debt: 0, count: 0 };
      bucket.total += Number(sale.totalAmount);
      bucket.paid += Number(sale.paidAmount);
      bucket.debt += Number(sale.debtAmount);
      bucket.count += 1;
      buckets.set(date, bucket);
    }

    return Array.from(buckets.values());
  }

  async topProducts() {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ["productId"],
      where: { order: { sale: { isNot: null } } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 10,
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((item) => item.productId) } },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    return grouped.map((item) => ({
      product: byId.get(item.productId),
      quantity: item._sum.quantity ?? 0,
      total: Number(item._sum.total ?? 0),
    }));
  }

  async frequentClients() {
    const grouped = await this.prisma.order.groupBy({
      by: ["clientId"],
      _count: { id: true },
      _sum: { total: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });
    const clients = await this.prisma.client.findMany({ where: { id: { in: grouped.map((item) => item.clientId) } } });
    const byId = new Map(clients.map((client) => [client.id, client]));
    return grouped.map((item) => ({
      client: byId.get(item.clientId),
      orders: item._count.id,
      total: Number(item._sum.total ?? 0),
    }));
  }

  debts() {
    return this.prisma.client.findMany({
      where: { debtBalance: { gt: 0 } },
      orderBy: { debtBalance: "desc" },
      include: { sales: { where: { debtAmount: { gt: 0 } }, orderBy: { issuedAt: "asc" } } },
    });
  }

  containersPending() {
    return this.prisma.client.findMany({
      where: { containerBalance: { gt: 0 } },
      orderBy: { containerBalance: "desc" },
    });
  }

  pendingOrders() {
    return this.prisma.order.findMany({
      where: { status: { in: [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.ON_ROUTE] } },
      orderBy: { orderedAt: "asc" },
      include: { client: true, deliveryUser: true, items: { include: { product: true } } },
    });
  }

  async salesByDelivery() {
    const sales = await this.prisma.sale.findMany({
      include: { order: { include: { deliveryUser: true } } },
    });
    const grouped = new Map<string, { repartidor: string; total: number; count: number }>();
    for (const sale of sales) {
      const delivery = sale.order.deliveryUser;
      const key = delivery?.id ?? "sin-repartidor";
      const current = grouped.get(key) ?? { repartidor: delivery?.name ?? "Sin repartidor", total: 0, count: 0 };
      current.total += Number(sale.totalAmount);
      current.count += 1;
      grouped.set(key, current);
    }
    return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
  }
}
