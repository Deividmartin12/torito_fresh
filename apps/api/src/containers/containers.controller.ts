import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { AdjustContainerDto } from './containers.dto';
import { ContainersService } from './containers.service';

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.DELIVERY, RoleName.WAREHOUSE, RoleName.SOCIO)
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

  @Roles(RoleName.ADMIN, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Post('adjust')
  adjust(
    @CurrentUser() user: AuthUser,
    @Body() dto: AdjustContainerDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.containers.adjust(dto, user, unidad);
  }
}
