import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(role?: RoleName) {
    return this.prisma.user.findMany({
      where: role ? { role: { name: role } } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
        role: { select: { name: true } },
      },
    });
  }

  roles() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateUserDto) {
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) {
      throw new BadRequestException('Rol invalido');
    }

    const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (exists) {
      throw new BadRequestException('El correo ya esta registrado');
    }

    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash: await bcrypt.hash(dto.password, 10),
        active: dto.active ?? true,
        roleId: role.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        role: { select: { name: true } },
      },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const role = dto.role
      ? await this.prisma.role.findUnique({ where: { name: dto.role } })
      : undefined;
    if (dto.role && !role) {
      throw new BadRequestException('Rol invalido');
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email?.toLowerCase(),
        active: dto.active,
        roleId: role?.id,
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        role: { select: { name: true } },
      },
    });
  }

  async setActive(id: string, active: boolean) {
    await this.ensureExists(id);
    return this.prisma.user.update({
      where: { id },
      data: { active },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        role: { select: { name: true } },
      },
    });
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
  }
}
