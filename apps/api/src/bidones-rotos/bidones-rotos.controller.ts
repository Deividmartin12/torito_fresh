import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { BidonesRotosService } from './bidones-rotos.service';
import { CreateBidonRotoDto } from './bidones-rotos.dto';

@Permisos('bidonesRotos.ver')
@Controller('bidones-rotos')
export class BidonesRotosController {
  constructor(private readonly bidonesRotos: BidonesRotosService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.bidonesRotos.list(user, from, to, unidad);
  }

  @Permisos('bidonesRotos.registrar')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBidonRotoDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.bidonesRotos.create(dto, user, unidad);
  }
}
