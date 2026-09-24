import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { RegistrarCargaDiariaDto } from './carga-diaria.dto';
import { CargaDiariaService } from './carga-diaria.service';

@Permisos('cargaDiaria.registrar')
@Controller('carga-diaria')
export class CargaDiariaController {
  constructor(private readonly cargaDiaria: CargaDiariaService) {}

  @Get()
  resumen(
    @CurrentUser() user: AuthUser,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.cargaDiaria.resumen(user, desde, hasta, unidad);
  }

  @Post()
  registrar(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegistrarCargaDiariaDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.cargaDiaria.registrar(dto, user, unidad);
  }
}
