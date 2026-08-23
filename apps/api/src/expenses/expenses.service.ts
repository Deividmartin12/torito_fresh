import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateExpenseDto } from "./expenses.dto";

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.gasto.findMany({
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
      take: 200,
      include: { trabajador: true },
    });
    return rows.map((row) => this.view(row));
  }

  async create(dto: CreateExpenseDto) {
    const date = new Date(`${dto.fecha.slice(0, 10)}T00:00:00-05:00`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException("La fecha del gasto no es válida");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (dto.fecha.slice(0, 10) > today) throw new BadRequestException("La fecha del gasto no puede estar en el futuro");

    const worker = await this.prisma.trabajador.findFirst({ where: { estado: true }, orderBy: { id: "asc" } });
    const row = await this.prisma.gasto.create({
      data: {
        fecha: date,
        concepto: dto.concepto.trim(),
        categoria: dto.categoria.trim(),
        monto: dto.monto,
        comprobante: dto.comprobante?.trim() || null,
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
      concepto: row.concepto,
      categoria: row.categoria,
      monto: Number(row.monto),
      comprobante: row.comprobante,
      observaciones: row.observaciones,
      registradoPor: row.trabajador ? `${row.trabajador.nombres} ${row.trabajador.apellidos}` : null,
    };
  }
}
