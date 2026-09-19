import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { AdjustContainerDto } from './containers.dto';
import { ContainersService } from './containers.service';

@Permisos('envases.ver')
@Controller('containers')
export class ContainersController {
  constructor(private readonly containers: ContainersService) {}

  @Get('pending')
  pending(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.containers.pendingClients(user, unidad);
  }

  @Get('movements')
  movements(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.containers.movements(user, clientId, unidad);
  }

  @Permisos('envases.ajustar')
  @Post('adjust')
  adjust(
    @CurrentUser() user: AuthUser,
    @Body() dto: AdjustContainerDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.containers.adjust(dto, user, unidad);
  }
}
