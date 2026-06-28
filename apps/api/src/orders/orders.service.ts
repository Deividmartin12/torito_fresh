import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, Prisma, RoleName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AssignDeliveryDto, CreateOrderDto, UpdateOrderStatusDto } from "./orders.dto";

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  list(filters: { status?: OrderStatus; deliveryUserId?: string; from?: string; to?: string }) {
    const where: Prisma.OrderWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.deliveryUserId ? { deliveryUserId: filters.deliveryUserId } : {}),
      ...(filters.from || filters.to
        ? {
            orderedAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };

    return this.prisma.order.findMany({
      where,
      orderBy: { orderedAt: "desc" },
      include: {
        client: true,
        deliveryUser: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } },
        sale: true,
      },
    });
  }

  async get(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        client: true,
        createdBy: { select: { id: true, name: true, email: true } },
        deliveryUser: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } },
        sale: { include: { payments: true } },
        delivery: true,
      },
    });

    if (!order) {
      throw new NotFoundException("Pedido no encontrado");
    }

    return order;
  }

  async create(dto: CreateOrderDto, createdById?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client || !client.active) {
      throw new BadRequestException("Cliente inactivo o no encontrado");
    }

    if (dto.deliveryUserId) {
      await this.ensureDeliveryUser(dto.deliveryUserId);
    }

    const productIds = dto.items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds }, active: true } });
    const productById = new Map(products.map((product) => [product.id, product]));

    const items = dto.items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) {
        throw new BadRequestException("Producto inactivo o no encontrado");
      }
      const unitPrice = item.unitPrice ?? Number(product.price);
      const total = unitPrice * item.quantity;
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        total,
      };
    });

    const total = items.reduce((sum, item) => sum + item.total, 0);

    return this.prisma.order.create({
      data: {
        clientId: dto.clientId,
        createdById,
        deliveryUserId: dto.deliveryUserId,
        observations: dto.observations,
        total,
        items: { create: items },
      },
      include: {
        client: true,
        deliveryUser: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } },
      },
    });
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.get(id);
    if (order.sale && dto.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException("No se puede cambiar un pedido que ya tiene venta");
    }

    return this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        observations: dto.observations ?? order.observations,
      },
      include: {
        client: true,
        deliveryUser: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } },
        sale: true,
      },
    });
  }

  async assignDelivery(id: string, dto: AssignDeliveryDto) {
    await this.get(id);
    await this.ensureDeliveryUser(dto.deliveryUserId);

    return this.prisma.order.update({
      where: { id },
      data: {
        deliveryUserId: dto.deliveryUserId,
        status: OrderStatus.ON_ROUTE,
      },
      include: {
        client: true,
        deliveryUser: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } },
      },
    });
  }

  async cancel(id: string) {
    const order = await this.get(id);
    if (order.sale) {
      throw new BadRequestException("No se puede cancelar un pedido con venta");
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED },
      include: {
        client: true,
        deliveryUser: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } },
      },
    });
  }

  private async ensureDeliveryUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user || !user.active || user.role.name !== RoleName.DELIVERY) {
      throw new BadRequestException("Repartidor invalido o inactivo");
    }
  }
}
