import { BadRequestException, Injectable } from '@nestjs/common';
import { accountState } from '../common/receivables';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async business(from?: string, to?: string) {
    const dateRange = this.dateRange(from, to);
    const expenseRange = this.expenseDateRange(from, to);
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
            include: {
              pagos: {
                where: { estado: 'CONFIRMADO', fechaPago: dateRange },
                include: { metodoPago: true },
              },
            },
          },
        },
      }),
      this.prisma.gasto.findMany({
        where: { fecha: expenseRange },
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
    const rangeStart = dateRange.gte.getTime();
    const rangeEnd = dateRange.lt.getTime();
    const customerMix = { new: 0, recurring: 0 };
    let totalSales = 0;
    let totalExpenses = 0;
    let totalCost = 0;
    let orderCount = 0;

    for (const sale of sales) {
      const returned = sale.devoluciones.reduce((sum, item) => sum + Number(item.total), 0);
      const netSale = Math.max(Number(sale.total) - returned, 0);
      const counts = netSale > 0 ? 1 : 0;
      orderCount += counts;
      const detalleSubtotal = sale.detalles.reduce((sum, item) => sum + Number(item.subtotal), 0);
      const movementDetails = sale.movimientosInventario.flatMap((movement) => movement.detalles);
      // Kardex cost and sold quantity aggregated per product so multi-lot / null-lot
      // fulfilment and split lines are handled without falling back to costoReferencia.
      const kardexCostByProduct = new Map<string, number>();
      for (const movement of movementDetails) {
        const key = movement.productoId.toString();
        kardexCostByProduct.set(
          key,
          (kardexCostByProduct.get(key) ?? 0) + Number(movement.costoTotal),
        );
      }
      const soldQtyByProduct = new Map<string, number>();
      for (const detail of sale.detalles) {
        const key = detail.productoId.toString();
        soldQtyByProduct.set(key, (soldQtyByProduct.get(key) ?? 0) + Number(detail.cantidad));
      }
      let saleCost = 0;
      for (const detail of sale.detalles) {
        const productKey = detail.productoId.toString();
        const returnedQuantity = detail.detallesDevolucion.reduce(
          (sum, item) => sum + Number(item.cantidad),
          0,
        );
        const netQuantity = Math.max(Number(detail.cantidad) - returnedQuantity, 0);
        const soldQty = soldQtyByProduct.get(productKey) ?? Number(detail.cantidad);
        const kardexCost = kardexCostByProduct.get(productKey);
        const lineCost =
          kardexCost != null && soldQty > 0
            ? kardexCost * (netQuantity / soldQty)
            : netQuantity * Number(detail.producto.costoReferencia);
        const share = detalleSubtotal > 0 ? Number(detail.subtotal) / detalleSubtotal : 0;
        const lineRevenue = netSale * share;
        saleCost += lineCost;
        const current = products.get(productKey) ?? {
          id: productKey,
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
      totalCost += saleCost;
      this.addPeriod(days, this.dayKey(sale.fecha), this.dayLabel(sale.fecha), {
        sales: netSale,
        cost: saleCost,
        margin: netSale - saleCost,
        orders: counts,
      });
      this.addPeriod(months, this.monthKey(sale.fecha), this.monthLabel(sale.fecha), {
        sales: netSale,
        cost: saleCost,
        margin: netSale - saleCost,
        orders: counts,
      });
      this.addRanking(
        zones,
        sale.cliente.direccion?.trim() || 'Sin zona registrada',
        sale.clienteId.toString(),
        netSale,
      );
      this.addRanking(clients, sale.cliente.nombreLegal, sale.clienteId.toString(), netSale);
      const first = firstSaleByClient.get(sale.clienteId.toString());
      if (first != null && first >= rangeStart && first < rangeEnd) customerMix.new += netSale;
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
      // `Gasto.fecha` is a date-only column (stored at UTC midnight); bucket it by its
      // calendar date in UTC so it is not shifted to the previous day like Lima would.
      this.addPeriod(days, this.utcDayKey(expense.fecha), this.utcDayLabel(expense.fecha), {
        expenses: amount,
      });
      this.addPeriod(months, this.utcMonthKey(expense.fecha), this.utcMonthLabel(expense.fecha), {
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

    const grossMargin = [...months.values()].reduce((sum, row) => sum + row.margin, 0);
    const profit = totalSales - totalExpenses;

    // Cartera por cobrar: total vigente y vencido en todo el negocio (no acotado
    // al período), para el indicador del panel y el acceso directo a Cobranzas.
    const openReceivables = await this.prisma.cuentaCobrar.findMany({
      where: { saldoPendiente: { gt: 0 } },
      select: { saldoPendiente: true, montoPagado: true, fechaVencimiento: true },
    });
    const receivables = openReceivables.reduce(
      (acc, cuenta) => {
        const saldo = Number(cuenta.saldoPendiente);
        acc.total += saldo;
        acc.count += 1;
        if (accountState(cuenta) === 'VENCIDA') {
          acc.overdue += saldo;
          acc.overdueCount += 1;
        }
        return acc;
      },
      { total: 0, count: 0, overdue: 0, overdueCount: 0 },
    );

    return {
      range: { from: dateRange.gte, to: dateRange.lt },
      receivables,
      summary: {
        sales: totalSales,
        expenses: totalExpenses,
        cost: totalCost,
        margin: grossMargin,
        marginRate: totalSales > 0 ? (grossMargin / totalSales) * 100 : 0,
        profit,
        profitRate: totalSales > 0 ? (profit / totalSales) * 100 : 0,
        orders: orderCount,
        ticket: orderCount ? totalSales / orderCount : 0,
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

  /**
   * Panel del repartidor: las ventas que registró hoy (America/Lima) más los totales
   * del día. `cobrado` es lo que se pagó en el momento de la venta (`montoInicial`).
   */
  async deliverySummary(userId: string) {
    const { gte, lt } = this.todayRange();
    const fecha = gte.toISOString().slice(0, 10);
    const trabajador = await this.prisma.trabajador.findFirst({ where: { userId } });
    if (!trabajador) {
      return { fecha, totales: { ventas: 0, monto: 0, cobrado: 0 }, items: [] };
    }

    const ventas = await this.prisma.venta.findMany({
      where: { trabajadorId: trabajador.id, fecha: { gte, lt } },
      orderBy: { fecha: 'desc' },
      include: { cliente: true },
    });

    return {
      fecha,
      totales: {
        ventas: ventas.length,
        monto: ventas.reduce((sum, venta) => sum + Number(venta.total), 0),
        cobrado: ventas.reduce((sum, venta) => sum + Number(venta.montoInicial), 0),
      },
      items: ventas.map((venta) => ({
        codigo: `V-${venta.id.toString().padStart(6, '0')}`,
        cliente: venta.cliente.nombreLegal,
        total: Number(venta.total),
        estadoPago: venta.estadoPago,
        estado: venta.estado,
      })),
    };
  }

  /** Rango [hoy 00:00, mañana 00:00) en America/Lima. */
  private todayRange() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    const gte = new Date(`${today}T00:00:00-05:00`);
    const lt = new Date(gte);
    lt.setDate(lt.getDate() + 1);
    return { gte, lt };
  }

  /** First day of the month `monthsBack` months before "today" in America/Lima. */
  private defaultRangeStart(monthsBack: number) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    return new Date(year, month - 1 - monthsBack, 1);
  }

  private dateRange(from?: string, to?: string) {
    const start = from ? new Date(`${from}T00:00:00-05:00`) : this.defaultRangeStart(11);
    const end = to ? new Date(`${to}T00:00:00-05:00`) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new BadRequestException('El rango de fechas no es valido');
    }
    if (to) end.setDate(end.getDate() + 1);
    return { gte: start, lt: end };
  }

  /**
   * Range for `Gasto.fecha`, a date-only column Postgres returns at UTC midnight.
   * Boundaries are UTC midnight so an expense dated exactly on `from` is included.
   */
  private expenseDateRange(from?: string, to?: string) {
    const defaultStart = this.defaultRangeStart(11);
    const start = from
      ? new Date(`${from}T00:00:00Z`)
      : new Date(Date.UTC(defaultStart.getFullYear(), defaultStart.getMonth(), 1));
    const end = to ? new Date(`${to}T00:00:00Z`) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new BadRequestException('El rango de fechas no es valido');
    }
    if (to) end.setUTCDate(end.getUTCDate() + 1);
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
  private utcDayKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }
  private utcMonthKey(date: Date) {
    return date.toISOString().slice(0, 7);
  }
  private utcDayLabel(date: Date) {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
    }).format(date);
  }
  private utcMonthLabel(date: Date) {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'UTC',
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
}
