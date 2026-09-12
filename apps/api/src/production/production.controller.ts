import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { AuthUser } from '../common/auth-user';
import { CreateProductionOrderDto, UpdateProductionOrderDto } from './production.dto';
import { ProductionService } from './production.service';

@Roles(RoleName.ADMIN, RoleName.WAREHOUSE)
@Controller('production')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get('catalogs') catalogs() {
    return this.production.catalogs();
  }
  @Get('orders') orders() {
    return this.production.orders();
  }
  @Post('orders') create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProductionOrderDto,
  ) {
    return this.production.create(dto, user);
  }
  @Patch('orders/:id') update(@Param('id') id: string, @Body() dto: UpdateProductionOrderDto) {
    return this.production.update(id, dto);
  }
}
