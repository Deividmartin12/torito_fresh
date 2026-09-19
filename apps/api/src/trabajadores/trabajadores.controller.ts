import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { CreateTrabajadorDto, UpdateTrabajadorDto } from './trabajadores.dto';
import { TrabajadoresService } from './trabajadores.service';

@Permisos('trabajadores.ver')
@Controller('trabajadores')
export class TrabajadoresController {
  constructor(private readonly trabajadores: TrabajadoresService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('active') active?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.trabajadores.list(user, search, active, unidad);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.trabajadores.get(id, user, unidad);
  }

  @Permisos('trabajadores.administrar')
  @Post()
  create(@Body() dto: CreateTrabajadorDto) {
    return this.trabajadores.create(dto);
  }

  @Permisos('trabajadores.administrar')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTrabajadorDto) {
    return this.trabajadores.update(id, dto);
  }
}
