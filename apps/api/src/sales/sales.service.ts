import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSaleFromOrderDto } from "./sales.dto";

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  list(filters: { from?: string; to?: string; clientId?: string }) {
    return this.prisma.sale.findMany({
      where: {
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(filters.from || filters.to
          ? {
              issuedAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { issuedAt: "desc" },
      include: {
        client: true,
        order: { include: { items: { include: { product: true } }, deliveryUser: true } },
        payments: true,
      },
    });
  }

  async get(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        client: true,
        order: { include: { items: { include: { product: true } }, deliveryUser: true } },
        payments: true,
      },
    });

    if (!sale) {
      throw new NotFoundException("Venta no encontrada");
    }

    return sale;
  }

  async createFromOrder(dto: CreateSaleFromOrderDto, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: dto.orderId },
        include: {
          client: true,
          items: { include: { product: true } },
          sale: true,
        },
      });

      if (!order) {
        throw new NotFoundException("Pedido no encontrado");
      }
      if (order.sale) {
        throw new BadRequestException("El pedido ya tiene venta");
      }
      if (order.status !== OrderStatus.DELIVERED) {
        throw new BadRequestException("Solo se puede vender un pedido entregado");
      }

      return this.createSaleForOrder(tx, order, dto.amountPaid ?? 0, dto.paymentMethod, userId);
    });
  }

  async createSaleForOrder(
    tx: Prisma.TransactionClient,
    order: Prisma.OrderGetPayload<{ include: { client: true; items: { include: { product: true } }; sale: true } }>,
    amountPaid: number,
    method: CreateSaleFromOrderDto["paymentMethod"],
    userId?: string,
  ) {
    const total = Number(order.total);
    const paid = Math.min(amountPaid, total);
    const debt = Math.max(total - paid, 0);
    const paymentStatus = debt <= 0 ? PaymentStatus.PAID : paid > 0 ? PaymentStatus.PARTIAL : PaymentStatus.PENDING;

    for (const item of order.items) {
      if (item.product.stock < item.quantity) {
        throw new BadRequestException(`Stock insuficiente para ${item.product.name}`);
      }
    }

    const sale = await tx.sale.create({
      data: {
        orderId: order.id,
        clientId: order.clientId,
        userId,
        totalAmount: total,
        paidAmount: paid,
        debtAmount: debt,
        paymentStatus,
        ticketNumber: this.makeTicketNumber(),
      },
    });

    if (paid > 0) {
      await tx.payment.create({
        data: {
          clientId: order.clientId,
          saleId: sale.id,
          userId,
          amount: paid,
          method,
          notes: "Pago recibido al generar venta",
        },
      });
    }

    if (debt > 0) {
      await tx.client.update({
        where: { id: order.clientId },
        data: { debtBalance: { increment: debt } },
      });
    }

    for (const item of order.items) {
      const updatedProduct = await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          orderId: order.id,
          userId,
          type: "SALE_OUT",
          quantity: item.quantity,
          stockAfter: updatedProduct.stock,
          notes: `Venta ${sale.ticketNumber}`,
        },
      });
    }

    return tx.sale.findUnique({
      where: { id: sale.id },
      include: {
        client: true,
        order: { include: { items: { include: { product: true } }, deliveryUser: true } },
        payments: true,
      },
    });
  }

  private makeTicketNumber() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const suffix = `${Date.now()}`.slice(-7);
    return `TF-${date}-${suffix}`;
  }
}
