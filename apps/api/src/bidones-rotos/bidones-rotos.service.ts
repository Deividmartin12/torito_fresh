import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBidonRotoDto } from './bidones-rotos.dto';

@Injectable()
export class BidonesRotosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(from?: string, to?: string) {
    // `BidonRoto.fecha` es una columna solo-fecha guardada a medianoche UTC; se
    // filtra con límites UTC para que un registro fechado justo en `from` entre y
    // `to` quede incluido.
    const hasRange = Boolean(from || to);
    const gte = from ? new Date(`${from}T00:00:00Z`) : undefined;
    let lt: Date | undefined;
    if (to) {
      lt = new Date(`${to}T00:00:00Z`);
      lt.setUTCDate(lt.getUTCDate() + 1);
    }
    if ((gte && Number.isNaN(gte.getTime())) || (lt && Number.isNaN(lt.getTime()))) {
      throw new BadRequestException('El rango de fechas no es válido');
    }
    const rows = await this.prisma.bidonRoto.findMany({
      where: hasRange ? { fecha: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } } : undefined,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 1000,
      include: { trabajador: true },
    });
    return rows.map((row) => this.view(row));
  }

  async create(dto: CreateBidonRotoDto) {
    const fecha = new Date(`${dto.fecha.slice(0, 10)}T00:00:00-05:00`);
    if (Number.isNaN(fecha.getTime())) throw new BadRequestException('La fecha no es válida');
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (dto.fecha.slice(0, 10) > today)
      throw new BadRequestException('La fecha no puede estar en el futuro');

    const worker = await this.prisma.trabajador.findFirst({
      where: { estado: true },
      orderBy: { id: 'asc' },
    });
    const row = await this.prisma.bidonRoto.create({
      data: {
        fecha,
        cantidad: dto.cantidad,
        observaciones: dto.observaciones?.trim() || null,
        trabajadorId: worker?.id,
      },
      include: { trabajador: true },
    });
    return this.view(row);
  }

  private view(row: any) {
    return {
      id: row.id.toString(),
      fecha: row.fecha,
      cantidad: row.cantidad,
      observaciones: row.observaciones,
      registradoPor: row.trabajador
        ? `${row.trabajador.nombres} ${row.trabajador.apellidos}`
        : null,
    };
  }
}
