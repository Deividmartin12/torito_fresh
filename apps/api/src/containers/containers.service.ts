import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustContainerDto } from './containers.dto';

@Injectable()
export class ContainersService {
  constructor(private readonly prisma: PrismaService) {}

  pendingClients() {
    return this.prisma.client.findMany({
      where: { containerBalance: { gt: 0 }, active: true },
      orderBy: { containerBalance: 'desc' },
      include: { containerMoves: { orderBy: { movedAt: 'desc' }, take: 5 } },
    });
  }

  movements(clientId?: string) {
    return this.prisma.containerMovement.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { movedAt: 'desc' },
      include: { client: true, order: true, user: { select: { id: true, name: true } } },
      take: 200,
    });
  }

  async adjust(dto: AdjustContainerDto, userId?: string) {
    if (dto.quantity === 0) {
      throw new BadRequestException('El ajuste no puede ser cero');
    }

    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { id: dto.clientId } });
      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }

      const balance = client.containerBalance + dto.quantity;
      if (balance < 0) {
        throw new BadRequestException('El ajuste deja saldo negativo');
      }

      await tx.client.update({ where: { id: client.id }, data: { containerBalance: balance } });

      return tx.containerMovement.create({
        data: {
          clientId: client.id,
          userId,
          type: dto.quantity > 0 ? 'OUT_FULL' : 'IN_EMPTY',
          quantity: Math.abs(dto.quantity),
          balanceAfter: balance,
          notes:
            dto.notes ??
            (dto.quantity > 0
              ? 'Ajuste aumenta deuda de envases'
              : 'Ajuste reduce deuda de envases'),
        },
        include: { client: true },
      });
    });
  }
}
