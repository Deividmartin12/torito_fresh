import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, ProductCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async business(from?: string, to?: string) {
    const dateRange = this.dateRange(from, to);
    const [sales, expenses, stocks, firstSales] = await Promise.all([
      this.prisma.venta.findMany({
        where: { estado: 'CONFIRMADA', fecha: dateRange },
        orderBy: { fecha: 'asc' },
        include: {
          cliente: true,
          detalles: {
            include: {
              producto: true,
              detallesDevolucion: { where: { devolucionVenta: { estado: 'CONFIRMADA' } } },
            },
          },
          devoluciones: { where: { estado: 'CONFIRMADA' } },
          movimientosInventario: {
            where: { tipoOperacion: 'VENTA', estado: 'CONFIRMADO' },
            include: { detalles: true },
          },
          cuentaCobrar: {
            include: { pagos: { where: { estado: 'CONFIRMADO' }, include: { metodoPago: true } } },
          },
        },
      }),
      this.prisma.gasto.findMany({
        where: { fecha: dateRange },
        orderBy: { fecha: 'asc' },
      }),
      this.prisma.producto.findMany({
        where: { estado: true },
        include: { stocks: { where: { estadoInventario: { codigo: 'DISPONIBLE' } } } },
      }),
      this.prisma.venta.groupBy({
        by: ['clienteId'],
        where: { estado: 'CONFIRMADA' },
        _min: { fecha: true },
      }),
    ]);

    type Period = {
      key: string;
      label: string;
      sales: number;
      expenses: number;
      cost: number;
      margin: number;
      orders: number;
    };
    type Ranking = { id: string; name: string; value: number; count: number };
    type ProductRanking = {
      id: string;
      name: string;
      quantity: number;
      revenue: number;
      cost: number;
      margin: number;
    };
    const months = new Map<string, Period>();
    const days = new Map<string, Period>();
    const products = new Map<string, ProductRanking>();
    const zones = new Map<string, Ranking>();
    const clients = new Map<string, Ranking>();
    const expenseCategories = new Map<string, Ranking>();
    const paymentMethods = new Map<string, number>();
    const heatmap = new Map<
      string,
      { day: number; dayLabel: string; hour: number; orders: number; sales: number }
    >();
    const firstSaleByClient = new Map(
      firstSales.map((row) => [row.clienteId.toString(), row._min.fecha?.getTime()]),
    );
    const customerMix = { new: 0, recurring: 0 };
    let totalSales = 0;
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalCost = 0;

    for (const sale of sales) {
      const returned = sale.devoluciones.reduce((sum, item) => sum + Number(item.total), 0);
      const netSale = Math.max(Number(sale.total) - returned, 0);
      const taxFactor = Number(sale.subtotal) > 0 ? Number(sale.total) / Number(sale.subtotal) : 1;
      const netBase = Math.max(Number(sale.subtotal) - returned / taxFactor, 0);
      const movementDetails = sale.movimientosInventario.flatMap((movement) => movement.detalles);
      let saleCost = 0;
      for (const detail of sale.detalles) {
        const returnedQuantity = detail.detallesDevolucion.reduce(
          (sum, item) => sum + Number(item.cantidad),
          0,
        );
        const netQuantity = Math.max(Number(detail.cantidad) - returnedQuantity, 0);
        const movement = movementDetails.find(
          (item) => item.productoId === detail.productoId && item.loteId === detail.loteId,
        );
        const unitCost = Number(movement?.costoUnitario ?? detail.producto.costoReferencia);
        const lineCost = netQuantity * unitCost;
        const share =
          Number(sale.subtotal) > 0 ? Number(detail.subtotal) / Number(sale.subtotal) : 0;
        const lineRevenue = netBase * share;
        saleCost += lineCost;
        const current = products.get(detail.productoId.toString()) ?? {
          id: detail.productoId.toString(),
          name: detail.producto.nombre,
          quantity: 0,
          revenue: 0,
          cost: 0,
          margin: 0,
        };
        current.quantity += netQuantity;
        current.revenue += lineRevenue;
        current.cost += lineCost;
        current.margin = current.revenue - current.cost;
        products.set(current.id, current);
      }
      totalSales += netSale;
      totalRevenue += netBase;
      totalCost += saleCost;
      this.addPeriod(days, this.dayKey(sale.fecha), this.dayLabel(sale.fecha), {
        sales: netSale,
        cost: saleCost,
        margin: netBase - saleCost,
        orders: 1,
      });
      this.addPeriod(months, this.monthKey(sale.fecha), this.monthLabel(sale.fecha), {
        sales: netSale,
        cost: saleCost,
        margin: netBase - saleCost,
        orders: 1,
      });
      this.addRanking(
        zones,
        sale.cliente.direccion?.trim() || 'Sin zona registrada',
        sale.clienteId.toString(),
        netSale,
      );
      this.addRanking(clients, sale.cliente.nombreLegal, sale.clienteId.toString(), netSale);
      const first = firstSaleByClient.get(sale.clienteId.toString());
      if (first === sale.fecha.getTime()) customerMix.new += netSale;
      else customerMix.recurring += netSale;
      const local = this.localParts(sale.fecha);
      const heatKey = `${local.weekday}-${local.hour}`;
      const heat = heatmap.get(heatKey) ?? {
        day: local.weekday,
        dayLabel: local.weekdayLabel,
        hour: local.hour,
        orders: 0,
        sales: 0,
      };
      heat.orders += 1;
      heat.sales += netSale;
      heatmap.set(heatKey, heat);
      for (const payment of sale.cuentaCobrar?.pagos ?? []) {
        paymentMethods.set(
          payment.metodoPago.nombre,
          (paymentMethods.get(payment.metodoPago.nombre) ?? 0) + Number(payment.monto),
        );
      }
    }

    for (const expense of expenses) {
      const amount = Number(expense.monto);
      totalExpenses += amount;
      this.addPeriod(days, this.dayKey(expense.fecha), this.dayLabel(expense.fecha), {
        expenses: amount,
      });
      this.addPeriod(months, this.monthKey(expense.fecha), this.monthLabel(expense.fecha), {
        expenses: amount,
      });
      this.addRanking(expenseCategories, expense.categoria, expense.categoria, amount);
    }

    const lowStockByProduct = new Map<
      string,
      { id: string; name: string; available: number; minimum: number }
    >();
    for (const product of stocks) {
      const key = product.id.toString();
      lowStockByProduct.set(key, {
        id: key,
        name: product.nombre,
        available: product.stocks.reduce(
          (sum, stock) =>
            sum + Math.max(Number(stock.cantidad) - Number(stock.cantidadReservada), 0),
          0,
        ),
        minimum: Number(product.stockMinimoGlobal),
      });
    }

    const margin = [...months.values()].reduce((sum, row) => sum + row.margin, 0);
    return {
      range: { from: dateRange.gte, to: dateRange.lt },
      summary: {
        sales: totalSales,
        expenses: totalExpenses,
        cost: totalCost,
        margin,
        marginRate: totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0,
        orders: sales.length,
        ticket: sales.length ? totalSales / sales.length : 0,
        expenseCount: expenses.length,
        averageExpense: expenses.length ? totalExpenses / expenses.length : 0,
      },
      daily: [...days.values()].sort((a, b) => a.key.localeCompare(b.key)),
      monthly: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
      topProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      zones: [...zones.values()].sort((a, b) => b.value - a.value).slice(0, 10),
      topClients: [...clients.values()].sort((a, b) => b.value - a.value).slice(0, 10),
      expenseCategories: [...expenseCategories.values()]
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      customerMix,
      paymentMethods: [...paymentMethods]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
      heatmap: [...heatmap.values()],
      lowStock: [...lowStockByProduct.values()]
        .filter((row) => row.available <= row.minimum)
        .sort((a, b) => a.available - b.available)
        .slice(0, 10),
    };
  }

  private dateRange(from?: string, to?: string) {
    const start = from
      ? new Date(`${from}T00:00:00-05:00`)
      : new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
    const end = to ? new Date(`${to}T00:00:00-05:00`) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new BadRequestException('El rango de fechas no es valido');
    }
    if (to) end.setDate(end.getDate() + 1);
    else end.setHours(23, 59, 59, 999);
    return { gte: start, lt: end };
  }

  private addPeriod(
    target: Map<string, any>,
    key: string,
    label: string,
    values: Partial<{
      sales: number;
      expenses: number;
      cost: number;
      margin: number;
      orders: number;
    }>,
  ) {
    const row = target.get(key) ?? {
      key,
      label,
      sales: 0,
      expenses: 0,
      cost: 0,
      margin: 0,
      orders: 0,
    };
    for (const [field, value] of Object.entries(values)) row[field] += value ?? 0;
    target.set(key, row);
  }

  private addRanking(
    target: Map<string, { id: string; name: string; value: number; count: number }>,
    name: string,
    id: string,
    value: number,
  ) {
    const row = target.get(name) ?? { id, name, value: 0, count: 0 };
    row.value += value;
    row.count += 1;
    target.set(name, row);
  }

  private dayKey(date: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
  private monthKey(date: Date) {
    return this.dayKey(date).slice(0, 7);
  }
  private dayLabel(date: Date) {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: 'short',
    }).format(date);
  }
  private monthLabel(date: Date) {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      month: 'short',
      year: '2-digit',
    }).format(date);
  }
  private localParts(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Lima',
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const weekdayName = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon';
    const weekdays: Record<string, [number, string]> = {
      Mon: [0, 'Lunes'],
      Tue: [1, 'Martes'],
      Wed: [2, 'Miercoles'],
      Thu: [3, 'Jueves'],
      Fri: [4, 'Viernes'],
      Sat: [5, 'Sabado'],
      Sun: [6, 'Domingo'],
    };
    const [weekday, weekdayLabel] = weekdays[weekdayName] ?? [0, 'Lunes'];
    return {
      weekday,
      weekdayLabel,
      hour: Number(parts.find((part) => part.type === 'hour')?.value ?? 0),
    };
  }

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
        where: { id: 'main' },
        update: {},
        create: { id: 'main', emptyContainers: 0 },
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
      orderBy: { issuedAt: 'asc' },
    });

    const buckets = new Map<
      string,
      { date: string; total: number; paid: number; debt: number; count: number }
    >();
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
      by: ['productId'],
      where: { order: { sale: { isNot: null } } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: 'desc' } },
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
      by: ['clientId'],
      _count: { id: true },
      _sum: { total: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });
    const clients = await this.prisma.client.findMany({
      where: { id: { in: grouped.map((item) => item.clientId) } },
    });
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
      orderBy: { debtBalance: 'desc' },
      include: { sales: { where: { debtAmount: { gt: 0 } }, orderBy: { issuedAt: 'asc' } } },
    });
  }

  containersPending() {
    return this.prisma.client.findMany({
      where: { containerBalance: { gt: 0 } },
      orderBy: { containerBalance: 'desc' },
    });
  }

  pendingOrders() {
    return this.prisma.order.findMany({
      where: { status: { in: [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.ON_ROUTE] } },
      orderBy: { orderedAt: 'asc' },
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
      const key = delivery?.id ?? 'sin-repartidor';
      const current = grouped.get(key) ?? {
        repartidor: delivery?.name ?? 'Sin repartidor',
        total: 0,
        count: 0,
      };
      current.total += Number(sale.totalAmount);
      current.count += 1;
      grouped.set(key, current);
    }
    return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
  }
}
