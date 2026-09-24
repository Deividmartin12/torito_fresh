import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { SituacionCredito, situacionDeCredito } from '../common/credit';
import {
  AlcanceUnidad,
  filtroUnidad,
  filtroUnidadPor,
  resolverAlcanceUnidad,
  resolverUnidadDeEscritura,
} from '../common/unit-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto } from './clients.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Situación de crédito por cliente. Es un alias de `situacionDeCredito` (common/credit.ts):
   * antes este cálculo vivía acá y se repetía a mano en el catálogo de la venta, así que el
   * aviso del formulario y el corte del servidor podían no coincidir.
   */
  private creditoDe(alcance: AlcanceUnidad, clienteIds?: bigint[]) {
    return situacionDeCredito(this.prisma, { alcance, clienteIds });
  }

  async list(actor: AuthUser, search?: string, active?: string, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const rows = await this.prisma.cliente.findMany({
      where: {
        ...filtroUnidad(alcance),
        // El cliente "Ventas del día" lo crea la carga diaria: no es alguien a quien atender.
        sistema: false,
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
    const debt = await this.creditoDe(alcance);
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
    const debt = await this.creditoDe(alcance, [row.id]);
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
          limiteCredito: dto.creditLimit ?? null,
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
      // `undefined` es "no lo mandaron" y `null` es "sacale el límite": los otros campos usan
      // el truthy de arriba, pero acá no sirve porque 0 y null son valores con significado.
      ...(dto.creditLimit === undefined ? {} : { limiteCredito: dto.creditLimit }),
      ...(dto.active === undefined ? {} : { estado: dto.active }),
    });
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const debt = await this.creditoDe(alcance, [row.id]);
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

  private view(row: any, debt?: SituacionCredito) {
    return {
      id: row.id.toString(),
      name: row.nombreLegal,
      documentType: row.tipoDocumento,
      document: row.numeroDocumento,
      phone: row.telefono ?? '',
      address: row.direccion ?? '',
      debtBalance: debt?.deuda ?? 0,
      pendingReceivables: debt?.comprobantes ?? 0,
      overdueBalance: debt?.vencido ?? 0,
      overdueCount: debt?.vencidas ?? 0,
      // Tope de crédito del cliente. `null` es "sin límite" y 0 es "no se le fía": son cosas
      // opuestas, así que el null NO se puede convertir en cero al viajar a la web.
      creditLimit: row.limiteCredito === null ? null : Number(row.limiteCredito),
      creditAvailable: debt?.disponible ?? null,
      // Antes fijo en 0: el saldo de envases vivía únicamente en el modelo
      // legacy Client, desconectado de este. Ver containers.service.ts.
      containerBalance: row.saldoEnvases ?? 0,
      active: row.estado,
    };
  }
}
