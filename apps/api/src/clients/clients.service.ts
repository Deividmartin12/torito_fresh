import { Injectable, NotFoundException } from '@nestjs/common';
import { accountState } from '../common/receivables';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto } from './clients.dto';

type ClientDebt = { total: number; comprobantes: number; vencido: number; vencidas: number };

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deuda vigente por cliente, derivada de las cuentas por cobrar con saldo
   * pendiente. El vencido se calcula por cuenta con la misma lógica que usa el
   * módulo de operaciones (`accountState`).
   */
  private async debtByClient(clienteIds?: bigint[]): Promise<Map<string, ClientDebt>> {
    const cuentas = await this.prisma.cuentaCobrar.findMany({
      where: {
        saldoPendiente: { gt: 0 },
        ...(clienteIds ? { clienteId: { in: clienteIds } } : {}),
      },
      select: {
        clienteId: true,
        saldoPendiente: true,
        montoPagado: true,
        fechaVencimiento: true,
      },
    });
    const map = new Map<string, ClientDebt>();
    for (const cuenta of cuentas) {
      const key = cuenta.clienteId.toString();
      const entry = map.get(key) ?? { total: 0, comprobantes: 0, vencido: 0, vencidas: 0 };
      const saldo = Number(cuenta.saldoPendiente);
      entry.total += saldo;
      entry.comprobantes += 1;
      if (accountState(cuenta) === 'VENCIDA') {
        entry.vencido += saldo;
        entry.vencidas += 1;
      }
      map.set(key, entry);
    }
    return map;
  }

  async list(search?: string, active?: string) {
    const rows = await this.prisma.cliente.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { nombreLegal: { contains: search, mode: 'insensitive' } },
                { telefono: { contains: search, mode: 'insensitive' } },
                { numeroDocumento: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(active === 'true' ? { estado: true } : active === 'false' ? { estado: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    const debt = await this.debtByClient();
    return rows.map((row) => this.view(row, debt.get(row.id.toString())));
  }

  async get(id: string) {
    const row = await this.prisma.cliente.findUnique({ where: { id: BigInt(id) } });
    if (!row) throw new NotFoundException('Cliente no encontrado');
    const debt = await this.debtByClient([row.id]);
    return this.view(row, debt.get(row.id.toString()));
  }

  async create(dto: CreateClientDto) {
    const row = await this.prisma.cliente.create({
      data: {
        tipoDocumento: dto.documentType ?? null,
        numeroDocumento: dto.document ?? null,
        nombreLegal: dto.name,
        telefono: dto.phone,
        direccion: dto.address ?? null,
        estado: true,
      },
    });
    return this.view(row);
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.get(id);
    const row = await this.prisma.cliente.update({
      where: { id: BigInt(id) },
      data: {
        ...(dto.documentType ? { tipoDocumento: dto.documentType } : {}),
        ...(dto.document ? { numeroDocumento: dto.document } : {}),
        ...(dto.name ? { nombreLegal: dto.name } : {}),
        ...(dto.phone ? { telefono: dto.phone } : {}),
        ...(dto.address ? { direccion: dto.address } : {}),
        ...(dto.active === undefined ? {} : { estado: dto.active }),
      },
    });
    const debt = await this.debtByClient([row.id]);
    return this.view(row, debt.get(row.id.toString()));
  }

  async deactivate(id: string) {
    await this.get(id);
    const row = await this.prisma.cliente.update({
      where: { id: BigInt(id) },
      data: { estado: false },
    });
    return this.view(row);
  }

  private view(row: any, debt?: ClientDebt) {
    return {
      id: row.id.toString(),
      name: row.nombreLegal,
      documentType: row.tipoDocumento,
      document: row.numeroDocumento,
      phone: row.telefono ?? '',
      address: row.direccion ?? '',
      debtBalance: debt?.total ?? 0,
      pendingReceivables: debt?.comprobantes ?? 0,
      overdueBalance: debt?.vencido ?? 0,
      overdueCount: debt?.vencidas ?? 0,
      containerBalance: 0,
      active: row.estado,
    };
  }
}
