import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClientDto, UpdateClientDto } from "./clients.dto";

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string, active?: string) {
    const rows = await this.prisma.cliente.findMany({
      where: {
        ...(search ? { OR: [{ nombreLegal: { contains: search, mode: "insensitive" } }, { telefono: { contains: search, mode: "insensitive" } }, { numeroDocumento: { contains: search, mode: "insensitive" } }] } : {}),
        ...(active === "true" ? { estado: true } : active === "false" ? { estado: false } : {}),
      }, orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.view(row));
  }

  async get(id: string) {
    const row = await this.prisma.cliente.findUnique({ where: { id: BigInt(id) } });
    if (!row) throw new NotFoundException("Cliente no encontrado");
    return this.view(row);
  }

  async create(dto: CreateClientDto) {
    const row = await this.prisma.cliente.create({ data: {
      tipoDocumento: dto.documentType ?? "DNI", numeroDocumento: dto.document ?? `TEMP-${Date.now()}`,
      nombreLegal: dto.name, telefono: dto.phone, direccion: dto.address, estado: true,
    }});
    return this.view(row);
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.get(id);
    const row = await this.prisma.cliente.update({ where: { id: BigInt(id) }, data: {
      ...(dto.documentType ? { tipoDocumento: dto.documentType } : {}), ...(dto.document ? { numeroDocumento: dto.document } : {}),
      ...(dto.name ? { nombreLegal: dto.name } : {}), ...(dto.phone ? { telefono: dto.phone } : {}), ...(dto.address ? { direccion: dto.address } : {}), ...(dto.active === undefined ? {} : { estado: dto.active }),
    }});
    return this.view(row);
  }

  async deactivate(id: string) {
    await this.get(id);
    const row = await this.prisma.cliente.update({ where: { id: BigInt(id) }, data: { estado: false } });
    return this.view(row);
  }

  private view(row: any) {
    return { id: row.id.toString(), name: row.nombreLegal, documentType: row.tipoDocumento, document: row.numeroDocumento, phone: row.telefono ?? "", address: row.direccion ?? "", debtBalance: Number(row.limiteCredito ?? 0), containerBalance: 0, active: row.estado };
  }
}
