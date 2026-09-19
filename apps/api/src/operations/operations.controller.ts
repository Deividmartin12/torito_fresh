import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import {
  CreateOperationalProductDto,
  CreateOperationalSaleDto,
  CreateOperationalWarehouseDto,
  CreateOwnPaymentMethodDto,
  CreateProductTypeDto,
  CreateReturnDto,
  RegisterOperationalPaymentDto,
  UpdateLoteDto,
  UpdateOperationalProductDto,
  UpdateOperationalSaleDto,
  UpdateReceivableDueDateDto,
} from './operations.dto';
import { OperationsService } from './operations.service';

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.SOCIO)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Get('catalogs')
  catalogs(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.catalogs(user, unidad);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Get('products')
  products(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.products(user, unidad);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
  @Post('products')
  createProduct(@Body() dto: CreateOperationalProductDto) {
    return this.operations.createProduct(dto);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateOperationalProductDto) {
    return this.operations.updateProduct(id, dto);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.operations.deleteProduct(id);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
  @Get('lots')
  lots(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.lots(user, unidad);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
  @Patch('lots/:id')
  updateLot(@Param('id') id: string, @Body() dto: UpdateLoteDto) {
    return this.operations.updateLot(id, dto);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.SOCIO)
  @Get('product-types')
  productTypes() {
    return this.operations.productTypes();
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
  @Post('product-types')
  createProductType(@Body() dto: CreateProductTypeDto) {
    return this.operations.createProductType(dto);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
  @Get('warehouses')
  warehouses(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.warehouses(user, unidad);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
  @Post('warehouses')
  createWarehouse(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOperationalWarehouseDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.createWarehouse(dto, user, unidad);
  }

  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Get('sales')
  sales(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('trabajadorId') trabajadorId?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.sales(user, from, to, trabajadorId, unidad);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Get('sales/:id')
  sale(@Param('id') id: string, @CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.sale(id, user, unidad);
  }
  // Registrar una venta es un solo paso: queda confirmada de inmediato (descuenta stock y
  // genera kardex en la misma operación), sin un paso de confirmación aparte.
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Post('sales')
  createSale(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOperationalSaleDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.createSale(dto, user, unidad);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Patch('sales/:id')
  updateSale(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOperationalSaleDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.updateSale(id, dto, user, unidad);
  }

  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Get('stock')
  stock(
    @CurrentUser() user: AuthUser,
    @Query('almacenId') almacenId?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.stock(user, almacenId, unidad);
  }
  @Get('movements') movements(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('productoId') productoId?: string,
    @Query('almacenId') almacenId?: string,
    @Query('tipoOperacion') tipoOperacion?: string,
    @Query('ref') ref?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.movements(
      user,
      { from, to, productoId, almacenId, tipoOperacion, ref },
      unidad,
    );
  }
  @Get('kardex') kardex(
    @CurrentUser() user: AuthUser,
    @Query('productoId') productoId?: string,
    @Query('almacenId') almacenId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.kardex(user, { productoId, almacenId, from, to }, unidad);
  }

  @Get('returns') returns(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.returns(user, unidad);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.SOCIO)
  @Post('returns/:type')
  createReturn(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Body() dto: CreateReturnDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.createReturn(type, dto, user, unidad);
  }

  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Get('payment-methods')
  paymentMethods(@CurrentUser() user: AuthUser, @Query('trabajadorId') trabajadorId?: string) {
    return this.operations.paymentMethods(user, trabajadorId);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Get('payment-method-categories')
  paymentMethodCategories() {
    return this.operations.paymentMethodCategories();
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Post('payment-methods')
  createOwnPaymentMethod(@CurrentUser() user: AuthUser, @Body() dto: CreateOwnPaymentMethodDto) {
    return this.operations.createOwnPaymentMethod(user, dto);
  }
  // Solo queda el tipo "cobrar" (cuentas por pagar desapareció junto con Compras); se
  // conserva el segmento :type en la ruta para no romper el cliente existente.
  @Get('accounts/:type') accounts(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Query('clienteId') clienteId?: string,
    @UnidadQuery() unidad?: string,
  ) {
    if (type !== 'cobrar') throw new BadRequestException('Tipo de cuenta inválido');
    return this.operations.accounts(user, clienteId, unidad);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.SOCIO)
  @Post('accounts/:type/payments')
  registerAccountPayment(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Body() dto: RegisterOperationalPaymentDto,
    @UnidadQuery() unidad?: string,
  ) {
    if (type !== 'cobrar') throw new BadRequestException('Tipo de cuenta inválido');
    return this.operations.registerAccountPayment(dto, user, unidad);
  }
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.SOCIO)
  @Patch('accounts/cobrar/:id/vencimiento')
  updateReceivableDueDate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReceivableDueDateDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.updateReceivableDueDate(id, dto, user, unidad);
  }
}
