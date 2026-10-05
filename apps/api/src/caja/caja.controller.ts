import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { CajaService } from './caja.service';
import {
  AjusteCajaDto,
  AperturaCajaDto,
  MovimientoCajaDto,
  TransferenciaCajaDto,
} from './caja.dto';

@Controller('caja')
@Permisos('caja.ver')
export class CajaController {
  constructor(private readonly caja: CajaService) {}
  @Get('cuentas') cuentas(@CurrentUser() actor: AuthUser, @UnidadQuery() unidad?: string) {
    return this.caja.cuentas(actor, unidad);
  }
  @Get('movimientos') movimientos(
    @CurrentUser() actor: AuthUser,
    @UnidadQuery() unidad: string | undefined,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cuentaId') cuentaId?: string,
    @Query('tipo') tipo?: string,
    @Query('pagina') pagina?: string,
  ) {
    return this.caja.movimientos(actor, { unidad, from, to, cuentaId, tipo, pagina });
  }
  @Post('aperturas') @Permisos('caja.ajustar') apertura(
    @Body() dto: AperturaCajaDto,
    @CurrentUser() actor: AuthUser,
    @UnidadQuery() unidad?: string,
  ) {
    return this.caja.apertura(dto, actor, unidad);
  }
  @Post('movimientos') @Permisos('caja.movimientos') manual(
    @Body() dto: MovimientoCajaDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.caja.manual(dto, actor);
  }
  @Post('transferencias') @Permisos('caja.movimientos') transferir(
    @Body() dto: TransferenciaCajaDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.caja.transferir(dto, actor);
  }
  @Post('cuentas/:id/ajustes') @Permisos('caja.ajustar') ajustar(
    @Param('id') id: string,
    @Body() dto: AjusteCajaDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.caja.ajustar(id, dto, actor);
  }
}
