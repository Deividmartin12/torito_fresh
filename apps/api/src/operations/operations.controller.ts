import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import {
  CreateOperationalProductDto,
  CreateOperationalSaleDto,
  CreateOperationalWarehouseDto,
  CreatePurchaseDto,
  CreateReturnDto,
  RegisterOperationalPaymentDto,
} from './operations.dto';
import { OperationsService } from './operations.service';

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('catalogs') catalogs() {
    return this.operations.catalogs();
  }
  @Get('products') products() {
    return this.operations.products();
  }
  @Post('products') createProduct(@Body() dto: CreateOperationalProductDto) {
    return this.operations.createProduct(dto);
  }
  @Delete('products/:id') deleteProduct(@Param('id') id: string) {
    return this.operations.deleteProduct(id);
  }
  @Get('warehouses') warehouses() {
    return this.operations.warehouses();
  }
  @Post('warehouses') createWarehouse(@Body() dto: CreateOperationalWarehouseDto) {
    return this.operations.createWarehouse(dto);
  }
  @Get('purchases') purchases() {
    return this.operations.purchases();
  }
  @Post('purchases') createPurchase(
    @Body() dto: CreatePurchaseDto,
    @Query('confirm') confirm?: string,
  ) {
    return this.operations.createPurchase(dto, confirm === 'true');
  }
  @Post('purchases/:id/confirm') confirmPurchase(@Param('id') id: string) {
    return this.operations.confirmPurchase(id);
  }

  @Get('sales') sales() {
    return this.operations.sales();
  }
  @Post('sales') createSale(
    @Body() dto: CreateOperationalSaleDto,
    @Query('confirm') confirm?: string,
  ) {
    return this.operations.createSale(dto, confirm === 'true');
  }
  @Post('sales/:id/confirm') confirmSale(@Param('id') id: string) {
    return this.operations.confirmSale(id);
  }

  @Get('stock') stock(@Query('almacenId') almacenId?: string) {
    return this.operations.stock(almacenId);
  }
  @Get('movements') movements() {
    return this.operations.movements();
  }

  @Get('returns') returns() {
    return this.operations.returns();
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
  @Post('returns/:type')
  createReturn(@Param('type') type: string, @Body() dto: CreateReturnDto) {
    return this.operations.createReturn(type, dto);
  }

  @Get('payment-methods') paymentMethods() {
    return this.operations.paymentMethods();
  }
  @Get('accounts/:type') accounts(@Param('type') type: string) {
    return this.operations.accounts(type);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @Post('accounts/:type/payments')
  registerAccountPayment(@Param('type') type: string, @Body() dto: RegisterOperationalPaymentDto) {
    return this.operations.registerAccountPayment(type, dto);
  }
}
