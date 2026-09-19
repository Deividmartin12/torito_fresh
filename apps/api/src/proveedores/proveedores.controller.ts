import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permisos } from '../auth/permisos.decorator';
import { CreateProveedorDto, UpdateProveedorDto } from './proveedores.dto';
import { ProveedoresService } from './proveedores.service';

@Permisos('proveedores.ver')
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

  @Permisos('proveedores.crear')
  @Post()
  create(@Body() dto: CreateProveedorDto) {
    return this.proveedores.create(dto);
  }

  // Su propio permiso, separado del alta: quien puede dar de alta un proveedor
  // tiene que poder corregirle un RUC mal tipeado.
  @Permisos('proveedores.editar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProveedorDto) {
    return this.proveedores.update(id, dto);
  }
}
