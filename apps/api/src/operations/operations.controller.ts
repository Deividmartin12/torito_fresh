import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { AuthUser } from '../common/auth-user';
import {
  CreateOperationalProductDto,
  CreateOperationalSaleDto,
  CreateOperationalWarehouseDto,
  CreateReturnDto,
  RegisterOperationalPaymentDto,
  UpdateOperationalSaleDto,
  UpdateReceivableDueDateDto,
} from './operations.dto';
import { OperationsService } from './operations.service';

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY)
  @Get('catalogs')
  catalogs() {
    return this.operations.catalogs();
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY)
  @Get('products') products() {
    return this.operations.products();
  }
  @Post('products') createProduct(@Body() dto: CreateOperationalProductDto) {
    return this.operations.createProduct(dto);
  }
  @Delete('products/:id') deleteProduct(@Param('id') id: string) {
    return this.operations.deleteProduct(id);
  }
  @Get('lots') lots() {
    return this.operations.lots();
  }
  @Get('product-types') productTypes() {
    return this.operations.productTypes();
  }
  @Get('warehouses') warehouses() {
    return this.operations.warehouses();
  }
  @Post('warehouses') createWarehouse(@Body() dto: CreateOperationalWarehouseDto) {
    return this.operations.createWarehouse(dto);
  }

  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY)
  @Get('sales')
  sales(@Query('from') from?: string, @Query('to') to?: string) {
    return this.operations.sales(from, to);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY)
  @Get('sales/:id')
  sale(@Param('id') id: string) {
    return this.operations.sale(id);
  }
  // Registrar una venta es un solo paso: queda confirmada de inmediato (descuenta stock y
  // genera kardex en la misma operación), sin un paso de confirmación aparte.
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY)
  @Post('sales')
  createSale(@CurrentUser() user: AuthUser, @Body() dto: CreateOperationalSaleDto) {
    return this.operations.createSale(dto, user.userId);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY)
  @Patch('sales/:id')
  updateSale(@Param('id') id: string, @Body() dto: UpdateOperationalSaleDto) {
    return this.operations.updateSale(id, dto);
  }

  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY)
  @Get('stock') stock(@Query('almacenId') almacenId?: string) {
    return this.operations.stock(almacenId);
  }
  @Get('movements') movements(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('productoId') productoId?: string,
    @Query('almacenId') almacenId?: string,
    @Query('tipoOperacion') tipoOperacion?: string,
    @Query('ref') ref?: string,
  ) {
    return this.operations.movements({ from, to, productoId, almacenId, tipoOperacion, ref });
  }
  @Get('kardex') kardex(
    @Query('productoId') productoId?: string,
    @Query('almacenId') almacenId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.operations.kardex({ productoId, almacenId, from, to });
  }

  @Get('returns') returns() {
    return this.operations.returns();
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
  @Post('returns/:type')
  createReturn(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Body() dto: CreateReturnDto,
  ) {
    return this.operations.createReturn(type, dto, user.userId);
  }

  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY)
  @Get('payment-methods')
  paymentMethods() {
    return this.operations.paymentMethods();
  }
  // Solo queda el tipo "cobrar" (cuentas por pagar desapareció junto con Compras); se
  // conserva el segmento :type en la ruta para no romper el cliente existente.
  @Get('accounts/:type') accounts(
    @Param('type') type: string,
    @Query('clienteId') clienteId?: string,
  ) {
    if (type !== 'cobrar') throw new BadRequestException('Tipo de cuenta inválido');
    return this.operations.accounts(clienteId);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @Post('accounts/:type/payments')
  registerAccountPayment(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Body() dto: RegisterOperationalPaymentDto,
  ) {
    if (type !== 'cobrar') throw new BadRequestException('Tipo de cuenta inválido');
    return this.operations.registerAccountPayment(dto, user.userId);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @Patch('accounts/cobrar/:id/vencimiento')
  updateReceivableDueDate(@Param('id') id: string, @Body() dto: UpdateReceivableDueDateDto) {
    return this.operations.updateReceivableDueDate(id, dto);
  }
}
