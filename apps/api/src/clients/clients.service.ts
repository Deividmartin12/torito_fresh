import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClientDto, UpdateClientDto } from "./clients.dto";

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string, active?: string) {
    const where: Prisma.ClientWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { document: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(active === "true" ? { active: true } : active === "false" ? { active: false } : {}),
    };

    return this.prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { orders: true, sales: true } },
      },
    });
  }

  async get(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { orderedAt: "desc" },
          take: 10,
          include: { items: { include: { product: true } }, deliveryUser: true },
        },
        sales: { orderBy: { issuedAt: "desc" }, take: 10 },
        payments: { orderBy: { paidAt: "desc" }, take: 10 },
        containerMoves: { orderBy: { movedAt: "desc" }, take: 10 },
      },
    });

    if (!client) {
      throw new NotFoundException("Cliente no encontrado");
    }

    return client;
  }

  create(dto: CreateClientDto) {
    return this.prisma.client.create({ data: dto });
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.get(id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async deactivate(id: string) {
    await this.get(id);
    return this.prisma.client.update({ where: { id }, data: { active: false } });
  }
}
