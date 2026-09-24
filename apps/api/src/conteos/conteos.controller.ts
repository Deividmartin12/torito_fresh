import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { ConteosQueryDto, CreateConteoDto } from './conteos.dto';
import { ConteosService } from './conteos.service';

@Permisos('stock.ver')
@Controller('conteos')
export class ConteosController {
  constructor(private readonly conteos: ConteosService) {}

  // La hoja pide `stock.ajustar` y no solo `stock.ver`: trae el desglose del kardex y el
  // teórico contra el que se va a escribir, y quien no puede corregir no tiene por qué verlo.
  @Permisos('stock.ajustar')
  @Get('hoja')
  hoja(
    @CurrentUser() user: AuthUser,
    @Query('almacenId') almacenId: string,
    @Query('fecha') fecha?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.conteos.hoja(user, almacenId, fecha, unidad);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ConteosQueryDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.conteos.list(user, query, unidad);
  }

  @Permisos('stock.ajustar')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateConteoDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.conteos.create(dto, user, unidad);
  }

  // Va al final para que `hoja` no caiga en este parámetro.
  @Get(':id')
  detalle(@Param('id') id: string, @CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.conteos.detalle(id, user, unidad);
  }
}
