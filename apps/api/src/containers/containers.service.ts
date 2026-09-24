import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cliente } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import {
  exigirMismaUnidad,
  filtroUnidad,
  filtroUnidadPor,
  resolverAlcanceUnidad,
  resolverUnidadDeEscritura,
} from '../common/unit-context';
import { exigirTrabajadorId } from '../common/worker-context';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustContainerDto } from './containers.dto';

/**
 * Envases retornables por cliente. Vivía contra el modelo legacy `Client`
 * (tabla `clients`, ids cuid), desconectado del `Cliente` que usa el resto
 * del sistema (ventas, cobranzas) — sin ninguna fila real y sin forma de
 * crear una. Ahora trabaja contra `Cliente.saldoEnvases`, agregado en la
 * migración `20260915024401_cliente_saldo_envases`. El modelo legacy se deja
 * intacto (no se borra nada), simplemente deja de usarse para lo nuevo.
 */
@Injectable()
export class ContainersService {
  constructor(private readonly prisma: PrismaService) {}

  async pendingClients(actor: AuthUser, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const rows = await this.prisma.cliente.findMany({
      where: { saldoEnvases: { gt: 0 }, estado: true, ...filtroUnidad(alcance) },
      orderBy: { saldoEnvases: 'desc' },
    });
    return rows.map((row) => this.viewCliente(row));
  }

  async movements(actor: AuthUser, clientId?: string, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const clienteId = clientId ? this.parseClienteId(clientId) : undefined;
    // `container_movements` no lleva la unidad: la hereda de su cliente. El filtro va también
    // en la rama con `clienteId` porque ese id llega del front y no está validado todavía.
    const rows = await this.prisma.containerMovement.findMany({
      where: {
        ...filtroUnidadPor('cliente', alcance),
        ...(clienteId ? { clienteId } : { clienteId: { not: null } }),
      },
      orderBy: { movedAt: 'desc' },
      include: {
        cliente: true,
        // De qué venta salió el movimiento. Sin esto el historial muestra la línea pero no
        // deja rastrear de dónde vino, que es justo lo que se pregunta cuando un saldo no
        // cuadra: si lo movió una venta o lo cargó alguien a mano.
        venta: { select: { id: true } },
        user: { select: { id: true, name: true } },
      },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      clientId: row.clienteId?.toString() ?? null,
      client: row.cliente ? { id: row.cliente.id.toString(), name: row.cliente.nombreLegal } : null,
      type: row.type,
      quantity: row.quantity,
      balanceAfter: row.balanceAfter,
      notes: row.notes,
      movedAt: row.movedAt,
      ventaId: row.ventaId?.toString() ?? null,
      venta: row.venta ? `V-${row.venta.id.toString().padStart(6, '0')}` : null,
      user: row.user,
    }));
  }

  async adjust(dto: AdjustContainerDto, actor: AuthUser, unidadActiva?: string) {
    if (dto.quantity === 0) {
      throw new BadRequestException('El ajuste no puede ser cero');
    }
    const clienteId = this.parseClienteId(dto.clientId);

    return this.prisma.$transaction(async (tx) => {
      // El saldo de envases es del cliente, así que ajustarlo es escribir sobre su unidad:
      // sin esta validación cualquiera podría mover el saldo de un cliente de otro puesto.
      const trabajadorId = await exigirTrabajadorId(tx, actor.userId);
      const unidad = await resolverUnidadDeEscritura(tx, {
        actor,
        unidadSolicitada: unidadActiva,
      });
      await exigirMismaUnidad(tx, unidad, { clienteId });

      const cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
      if (!cliente) {
        throw new NotFoundException('Cliente no encontrado');
      }

      const balance = cliente.saldoEnvases + dto.quantity;
      if (balance < 0) {
        throw new BadRequestException('El ajuste deja saldo negativo');
      }

      await tx.cliente.update({ where: { id: clienteId }, data: { saldoEnvases: balance } });

      const movement = await tx.containerMovement.create({
        data: {
          clienteId,
          userId: actor.userId,
          type: dto.quantity > 0 ? 'OUT_FULL' : 'IN_EMPTY',
          quantity: Math.abs(dto.quantity),
          balanceAfter: balance,
          notes:
            dto.notes ??
            (dto.quantity > 0
              ? 'Ajuste aumenta deuda de envases'
              : 'Ajuste reduce deuda de envases'),
        },
      });

      return {
        id: movement.id,
        clientId: cliente.id.toString(),
        client: { id: cliente.id.toString(), name: cliente.nombreLegal },
        type: movement.type,
        quantity: movement.quantity,
        balanceAfter: movement.balanceAfter,
        notes: movement.notes,
        movedAt: movement.movedAt,
      };
    });
  }

  private parseClienteId(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new NotFoundException('Cliente no encontrado');
    }
  }

  private viewCliente(row: Cliente) {
    return {
      id: row.id.toString(),
      name: row.nombreLegal,
      documentType: row.tipoDocumento,
      document: row.numeroDocumento,
      phone: row.telefono ?? '',
      address: row.direccion ?? '',
      containerBalance: row.saldoEnvases,
      active: row.estado,
    };
  }
}
