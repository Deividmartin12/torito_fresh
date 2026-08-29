import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CreateTrabajadorDto, UpdateTrabajadorDto } from './trabajadores.dto';
import { TrabajadoresService } from './trabajadores.service';

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
@Controller('trabajadores')
export class TrabajadoresController {
  constructor(private readonly trabajadores: TrabajadoresService) {}

  @Get()
  list(@Query('search') search?: string, @Query('active') active?: string) {
    return this.trabajadores.list(search, active);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.trabajadores.get(id);
  }

  @Roles(RoleName.ADMIN)
  @Post()
  create(@Body() dto: CreateTrabajadorDto) {
    return this.trabajadores.create(dto);
  }

  @Roles(RoleName.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTrabajadorDto) {
    return this.trabajadores.update(id, dto);
  }
}
