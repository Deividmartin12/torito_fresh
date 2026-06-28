import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InventoryMovementType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateInventoryMovementDto } from "./inventory.dto";

const POSITIVE_PRODUCT_TYPES = new Set<InventoryMovementType>([
  InventoryMovementType.PRODUCTION_IN,
  InventoryMovementType.PURCHASE_IN,
  InventoryMovementType.ADJUSTMENT_IN,
  InventoryMovementType.RETURN_IN,
]);

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [products, warehouse] = await Promise.all([
      this.prisma.product.findMany({ orderBy: { name: "asc" } }),
      this.prisma.warehouseState.upsert({
        where: { id: "main" },
        update: {},
        create: { id: "main", emptyContainers: 0 },
      }),
    ]);

    return { products, warehouse };
  }

  movements(productId?: string) {
    return this.prisma.inventoryMovement.findMany({
      where: productId ? { productId } : undefined,
      orderBy: { movedAt: "desc" },
      include: { product: true, order: true, user: { select: { id: true, name: true } } },
      take: 250,
    });
  }

  async createMovement(dto: CreateInventoryMovementDto, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      let stockAfter: number | undefined;
      let emptyContainersAfter: number | undefined;
      let productId = dto.productId;
      let emptyDelta = dto.emptyContainersDelta ?? 0;

      if (productId) {
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) {
          throw new NotFoundException("Producto no encontrado");
        }

        const productSign = POSITIVE_PRODUCT_TYPES.has(dto.type) ? 1 : -1;
        const stock = product.stock + productSign * dto.quantity;
        if (stock < 0) {
          throw new BadRequestException("El movimiento deja stock negativo");
        }

        if (dto.type === InventoryMovementType.PRODUCTION_IN && product.returnable && dto.emptyContainersDelta === undefined) {
          emptyDelta = -dto.quantity;
        }

        const updatedProduct = await tx.product.update({
          where: { id: product.id },
          data: { stock },
        });
        stockAfter = updatedProduct.stock;
      } else if (dto.quantity > 0 && dto.emptyContainersDelta === undefined) {
        throw new BadRequestException("Indique producto o variacion de envases vacios");
      }

      if (emptyDelta !== 0) {
        const warehouse = await tx.warehouseState.upsert({
          where: { id: "main" },
          update: {},
          create: { id: "main", emptyContainers: 0 },
        });
        const nextEmpty = warehouse.emptyContainers + emptyDelta;
        if (nextEmpty < 0) {
          throw new BadRequestException("El movimiento deja envases vacios negativos");
        }
        const updatedWarehouse = await tx.warehouseState.update({
          where: { id: "main" },
          data: { emptyContainers: nextEmpty },
        });
        emptyContainersAfter = updatedWarehouse.emptyContainers;
      }

      return tx.inventoryMovement.create({
        data: {
          productId,
          userId,
          type: dto.type,
          quantity: dto.quantity,
          stockAfter,
          emptyContainersDelta: emptyDelta,
          emptyContainersAfter,
          notes: dto.notes,
        },
        include: { product: true },
      });
    });
  }
}
