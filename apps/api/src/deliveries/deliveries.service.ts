import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, RoleName } from "@prisma/client";
import { AuthUser } from "../common/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { SalesService } from "../sales/sales.service";
import { CompleteDeliveryDto } from "./deliveries.dto";

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
  ) {}

  list(filters: { deliveryUserId?: string; from?: string; to?: string }) {
    return this.prisma.delivery.findMany({
      where: {
        ...(filters.deliveryUserId ? { deliveryUserId: filters.deliveryUserId } : {}),
        ...(filters.from || filters.to
          ? {
              deliveredAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { deliveredAt: "desc" },
      include: {
        deliveryUser: { select: { id: true, name: true, email: true } },
        order: { include: { client: true, items: { include: { product: true } }, sale: true } },
      },
    });
  }

  async complete(dto: CompleteDeliveryDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: dto.orderId },
        include: {
          client: true,
          sale: true,
          items: { include: { product: true } },
        },
      });

      if (!order) {
        throw new NotFoundException("Pedido no encontrado");
      }
      if (order.status === OrderStatus.CANCELLED) {
        throw new BadRequestException("No se puede entregar un pedido cancelado");
      }
      if (order.sale) {
        throw new BadRequestException("El pedido ya fue convertido en venta");
      }
      if (dto.paymentReceived > Number(order.total)) {
        throw new BadRequestException("El pago recibido no puede superar el total");
      }

      const deliveryUserId =
        dto.deliveryUserId ?? order.deliveryUserId ?? (user.role === RoleName.DELIVERY ? user.userId : undefined);

      if (deliveryUserId) {
        const deliveryUser = await tx.user.findUnique({ where: { id: deliveryUserId }, include: { role: true } });
        if (!deliveryUser || !deliveryUser.active || deliveryUser.role.name !== RoleName.DELIVERY) {
          throw new BadRequestException("Repartidor invalido o inactivo");
        }
      }

      let balance = order.client.containerBalance;

      if (dto.containersDelivered > 0) {
        balance += dto.containersDelivered;
        await tx.containerMovement.create({
          data: {
            clientId: order.clientId,
            orderId: order.id,
            userId: user.userId,
            type: "OUT_FULL",
            quantity: dto.containersDelivered,
            balanceAfter: balance,
            notes: "Envases llenos entregados",
          },
        });
      }

      if (dto.containersReturned > balance) {
        throw new BadRequestException("La devolucion supera el saldo de envases del cliente");
      }

      if (dto.containersReturned > 0) {
        balance -= dto.containersReturned;
        await tx.containerMovement.create({
          data: {
            clientId: order.clientId,
            orderId: order.id,
            userId: user.userId,
            type: "IN_EMPTY",
            quantity: dto.containersReturned,
            balanceAfter: balance,
            notes: "Envases vacios devueltos",
          },
        });

        const warehouse = await tx.warehouseState.upsert({
          where: { id: "main" },
          update: { emptyContainers: { increment: dto.containersReturned } },
          create: { id: "main", emptyContainers: dto.containersReturned },
        });

        await tx.inventoryMovement.create({
          data: {
            type: "RETURN_IN",
            quantity: dto.containersReturned,
            emptyContainersDelta: dto.containersReturned,
            emptyContainersAfter: warehouse.emptyContainers,
            orderId: order.id,
            userId: user.userId,
            notes: "Ingreso de envases vacios por reparto",
          },
        });
      }

      await tx.client.update({
        where: { id: order.clientId },
        data: { containerBalance: balance },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.DELIVERED,
          deliveryUserId,
          observations: dto.observations ?? order.observations,
        },
      });

      await tx.delivery.create({
        data: {
          orderId: order.id,
          deliveryUserId,
          containersDelivered: dto.containersDelivered,
          containersReturned: dto.containersReturned,
          paymentReceived: dto.paymentReceived,
          observations: dto.observations,
        },
      });

      await this.sales.createSaleForOrder(tx, order, dto.paymentReceived, dto.paymentMethod, user.userId);

      return tx.order.findUnique({
        where: { id: order.id },
        include: {
          client: true,
          delivery: true,
          sale: { include: { payments: true } },
          deliveryUser: { select: { id: true, name: true, email: true } },
          items: { include: { product: true } },
        },
      });
    });
  }
}
