import { Body, Controller, Get, Post } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CreateProductionOrderDto } from './production.dto';
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
  @Post('orders') create(@Body() dto: CreateProductionOrderDto) {
    return this.production.create(dto);
  }
}
