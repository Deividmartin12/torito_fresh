import { Injectable } from '@nestjs/common';
import { daysUntil } from '../common/receivables';
import { PrismaService } from '../prisma/prisma.service';

const DIA_MS = 86_400_000;
const DIAS_POR_VENCER = 7;

type VentaCliente = { fecha: Date; total: number };

@Injectable()
export class RecargasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Tiempo de recarga" por cliente: cada cuánto vuelve a comprar y cuánto paga.
   * Todo se deriva de las ventas confirmadas; no hay un registro propio.
   */
  async list() {
    const ventas = await this.prisma.venta.findMany({
      where: { estado: 'CONFIRMADA' },
      orderBy: { fecha: 'asc' },
      select: {
        clienteId: true,
        fecha: true,
        total: true,
        cliente: { select: { nombreLegal: true, telefono: true } },
      },
    });

    // Ventas agrupadas por cliente, ya en orden ascendente por fecha.
    const porCliente = new Map<
      string,
      { nombre: string; telefono: string | null; ventas: VentaCliente[] }
    >();
    for (const venta of ventas) {
      const key = venta.clienteId.toString();
      const grupo = porCliente.get(key) ?? {
        nombre: venta.cliente.nombreLegal,
        telefono: venta.cliente.telefono,
        ventas: [],
      };
      grupo.ventas.push({ fecha: venta.fecha, total: Number(venta.total) });
      porCliente.set(key, grupo);
    }

    const filas = [...porCliente.entries()].map(([id, grupo]) =>
      this.resumenCliente(id, grupo.nombre, grupo.telefono, grupo.ventas),
    );

    const prioridad = { ATRASADO: 0, POR_VENCER: 1, AL_DIA: 2, SIN_HISTORIAL: 3 };
    return filas.sort((a, b) => {
      if (prioridad[a.estado] !== prioridad[b.estado])
        return prioridad[a.estado] - prioridad[b.estado];
      // Dentro del mismo estado, primero al que le toca recargar antes.
      return (a.proximaRecarga ?? a.ultimaRecarga).localeCompare(
        b.proximaRecarga ?? b.ultimaRecarga,
      );
    });
  }

  private resumenCliente(
    clienteId: string,
    nombre: string,
    telefono: string | null,
    ventas: VentaCliente[],
  ) {
    const compras = ventas.length;
    const primera = ventas[0].fecha;
    const ultima = ventas[compras - 1].fecha;
    const totalPagado = ventas.reduce((suma, venta) => suma + venta.total, 0);

    // El intervalo promedio necesita al menos dos compras para poder medir la
    // distancia entre una y otra.
    const intervaloDias =
      compras >= 2
        ? Math.round((ultima.getTime() - primera.getTime()) / DIA_MS / (compras - 1))
        : null;

    const proximaRecarga =
      intervaloDias !== null
        ? new Date(ultima.getTime() + intervaloDias * DIA_MS).toISOString().slice(0, 10)
        : null;
    const diasParaProxima = proximaRecarga ? daysUntil(proximaRecarga) : null;

    return {
      clienteId,
      cliente: nombre,
      telefono: telefono ?? null,
      compras,
      primeraRecarga: primera.toISOString().slice(0, 10),
      ultimaRecarga: ultima.toISOString().slice(0, 10),
      diasDesdeUltima: -(daysUntil(ultima.toISOString().slice(0, 10)) ?? 0),
      intervaloDias,
      proximaRecarga,
      diasParaProxima,
      pagoPromedio: totalPagado / compras,
      ultimoPago: ventas[compras - 1].total,
      totalPagado,
      estado: this.estado(compras, diasParaProxima),
    };
  }

  private estado(
    compras: number,
    diasParaProxima: number | null,
  ): 'SIN_HISTORIAL' | 'ATRASADO' | 'POR_VENCER' | 'AL_DIA' {
    if (compras < 2 || diasParaProxima === null) return 'SIN_HISTORIAL';
    if (diasParaProxima < 0) return 'ATRASADO';
    if (diasParaProxima <= DIAS_POR_VENCER) return 'POR_VENCER';
    return 'AL_DIA';
  }
}
