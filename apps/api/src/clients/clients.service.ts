import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { accountState } from '../common/receivables';
import {
  AlcanceUnidad,
  filtroUnidad,
  filtroUnidadPor,
  resolverAlcanceUnidad,
  resolverUnidadDeEscritura,
} from '../common/unit-context';
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
  private async debtByClient(
    alcance: AlcanceUnidad,
    clienteIds?: bigint[],
  ): Promise<Map<string, ClientDebt>> {
    const cuentas = await this.prisma.cuentaCobrar.findMany({
      where: {
        saldoPendiente: { gt: 0 },
        ...filtroUnidadPor('cliente', alcance),
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

  async list(actor: AuthUser, search?: string, active?: string, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const rows = await this.prisma.cliente.findMany({
      where: {
        ...filtroUnidad(alcance),
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
    const debt = await this.debtByClient(alcance);
    return rows.map((row) => this.view(row, debt.get(row.id.toString())));
  }

  /**
   * Un cliente de otra unidad no es "prohibido", es inexistente: se usa `findFirst` con el
   * filtro de unidad para que el 404 salga solo y sin revelar que el id existe en otro lado.
   * De ahí cuelgan `update`, `activate` y `deactivate`, que llaman acá primero.
   */
  async get(id: string, actor: AuthUser, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const row = await this.prisma.cliente.findFirst({
      where: { id: BigInt(id), ...filtroUnidad(alcance) },
    });
    if (!row) throw new NotFoundException('Cliente no encontrado');
    const debt = await this.debtByClient(alcance, [row.id]);
    return this.view(row, debt.get(row.id.toString()));
  }

  async create(dto: CreateClientDto, actor: AuthUser, unidad?: string) {
    // El cliente nace en la unidad que se está mirando, no en la de quien lo registra: un
    // admin parado en un puesto satélite está cargando la cartera de ESE puesto.
    const unidadNegocioId = await resolverUnidadDeEscritura(this.prisma, {
      actor,
      unidadSolicitada: unidad,
    });
    try {
      const row = await this.prisma.cliente.create({
        data: {
          unidadNegocioId,
          tipoDocumento: dto.documentType ?? null,
          numeroDocumento: dto.document ?? null,
          nombreLegal: dto.name,
          telefono: dto.phone,
          direccion: dto.address ?? null,
          estado: true,
        },
      });
      return this.view(row);
    } catch (error) {
      throw this.traducirDocumentoDuplicado(error);
    }
  }

  async update(id: string, dto: UpdateClientDto, actor: AuthUser, unidad?: string) {
    await this.get(id, actor, unidad);
    const row = await this.actualizar(id, {
      ...(dto.documentType ? { tipoDocumento: dto.documentType } : {}),
      ...(dto.document ? { numeroDocumento: dto.document } : {}),
      ...(dto.name ? { nombreLegal: dto.name } : {}),
      ...(dto.phone ? { telefono: dto.phone } : {}),
      ...(dto.address ? { direccion: dto.address } : {}),
      ...(dto.active === undefined ? {} : { estado: dto.active }),
    });
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const debt = await this.debtByClient(alcance, [row.id]);
    return this.view(row, debt.get(row.id.toString()));
  }

  async deactivate(id: string, actor: AuthUser, unidad?: string) {
    return this.setEstado(id, false, actor, unidad);
  }

  async activate(id: string, actor: AuthUser, unidad?: string) {
    return this.setEstado(id, true, actor, unidad);
  }

  private async setEstado(id: string, estado: boolean, actor: AuthUser, unidad?: string) {
    await this.get(id, actor, unidad);
    const row = await this.prisma.cliente.update({
      where: { id: BigInt(id) },
      data: { estado },
    });
    return this.view(row);
  }

  /** Un `update` que traduce el choque de documento igual que el alta. */
  private async actualizar(id: string, data: Prisma.ClienteUpdateInput) {
    try {
      return await this.prisma.cliente.update({ where: { id: BigInt(id) }, data });
    } catch (error) {
      throw this.traducirDocumentoDuplicado(error);
    }
  }

  /**
   * El documento es único DENTRO de la unidad. Prisma devuelve un P2002 seco que en pantalla
   * se leería como un error de sistema, así que se traduce a algo accionable.
   */
  private traducirDocumentoDuplicado(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new BadRequestException('Ya tienes registrado un cliente con ese documento');
    }
    return error;
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
      // Antes fijo en 0: el saldo de envases vivía únicamente en el modelo
      // legacy Client, desconectado de este. Ver containers.service.ts.
      containerBalance: row.saldoEnvases ?? 0,
      active: row.estado,
    };
  }
}
