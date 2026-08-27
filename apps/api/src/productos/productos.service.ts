import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductoDto, UpdateProductoDto } from './productos.dto';

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string, active?: string) {
    const where: Prisma.ProductWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(active === 'true' ? { active: true } : active === 'false' ? { active: false } : {}),
    };

    return this.prisma.product.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { inventoryMoves: { orderBy: { movedAt: 'desc' }, take: 20 } },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  create(dto: CreateProductoDto) {
    return this.prisma.product.create({ data: dto });
  }

  async update(id: string, dto: UpdateProductoDto) {
    await this.get(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async deactivate(id: string) {
    await this.get(id);
    return this.prisma.product.update({ where: { id }, data: { active: false } });
  }
}
