import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CreateProveedorDto, UpdateProveedorDto } from './proveedores.dto';
import { ProveedoresService } from './proveedores.service';

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.SOCIO)
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedores: ProveedoresService) {}

  @Get()
  list(@Query('search') search?: string, @Query('active') active?: string) {
    return this.proveedores.list(search, active);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.proveedores.get(id);
  }

  @Post()
  create(@Body() dto: CreateProveedorDto) {
    return this.proveedores.create(dto);
  }

  // Mismos roles que el alta (el `@Roles` de la clase): quien puede dar de alta un proveedor
  // tiene que poder corregirle un RUC mal tipeado.
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.SOCIO)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProveedorDto) {
    return this.proveedores.update(id, dto);
  }
}
