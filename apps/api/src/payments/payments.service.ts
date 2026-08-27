import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterPaymentDto } from './payments.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(clientId?: string) {
    return this.prisma.payment.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { paidAt: 'desc' },
      include: { client: true, sale: true, user: { select: { id: true, name: true } } },
    });
  }

  debts() {
    return this.prisma.sale.findMany({
      where: { debtAmount: { gt: 0 } },
      orderBy: { issuedAt: 'asc' },
      include: {
        client: true,
        order: { include: { deliveryUser: true } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });
  }

  async register(dto: RegisterPaymentDto, userId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: dto.saleId },
        include: { client: true },
      });
      if (!sale) {
        throw new NotFoundException('Venta no encontrada');
      }

      const debt = Number(sale.debtAmount);
      if (debt <= 0) {
        throw new BadRequestException('La venta ya esta pagada');
      }
      if (dto.amount > debt) {
        throw new BadRequestException('El pago supera la deuda pendiente');
      }

      const payment = await tx.payment.create({
        data: {
          clientId: sale.clientId,
          saleId: sale.id,
          userId,
          amount: dto.amount,
          method: dto.method,
          notes: dto.notes,
        },
      });

      const newDebt = Math.max(debt - dto.amount, 0);
      const newPaid = Number(sale.paidAmount) + dto.amount;

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount: newPaid,
          debtAmount: newDebt,
          paymentStatus: newDebt <= 0 ? PaymentStatus.PAID : PaymentStatus.PARTIAL,
        },
      });

      await tx.client.update({
        where: { id: sale.clientId },
        data: { debtBalance: { decrement: dto.amount } },
      });

      return payment;
    });
  }
}
