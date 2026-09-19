import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { CreateTrabajadorDto, UpdateTrabajadorDto } from './trabajadores.dto';
import { TrabajadoresService } from './trabajadores.service';

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.SOCIO)
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
