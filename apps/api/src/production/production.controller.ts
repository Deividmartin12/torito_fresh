import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
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
  @Post('orders') create(@Body() dto: CreateProductionOrderDto) {
    return this.production.create(dto);
  }
  @Patch('orders/:id') update(@Param('id') id: string, @Body() dto: UpdateProductionOrderDto) {
    return this.production.update(id, dto);
  }
}
