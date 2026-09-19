import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { CreateProductionOrderDto, UpdateProductionOrderDto } from './production.dto';
import { ProductionService } from './production.service';

@Roles(RoleName.ADMIN, RoleName.WAREHOUSE)
@Controller('production')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get('catalogs') catalogs(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.production.catalogs(user, unidad);
  }
  @Get('orders') orders(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.production.orders(user, unidad);
  }
  @Post('orders') create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProductionOrderDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.production.create(dto, user, unidad);
  }
  @Patch('orders/:id') update(
    @Param('id') id: string,
    @Body() dto: UpdateProductionOrderDto,
    @CurrentUser() user: AuthUser,
    @UnidadQuery() unidad?: string,
  ) {
    return this.production.update(id, dto, user, unidad);
  }
}
