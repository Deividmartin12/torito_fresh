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
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
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

@Permisos('kardex.ver')
@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Permisos('productos.ver')
  @Get('catalogs')
  catalogs(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.catalogs(user, unidad);
  }
  @Permisos('productos.ver')
  @Get('products')
  products(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.products(user, unidad);
  }
  @Permisos('productos.editar')
  @Post('products')
  createProduct(@Body() dto: CreateOperationalProductDto) {
    return this.operations.createProduct(dto);
  }
  @Permisos('productos.editar')
  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateOperationalProductDto) {
    return this.operations.updateProduct(id, dto);
  }
  @Permisos('productos.editar')
  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.operations.deleteProduct(id);
  }
  @Permisos('lotes.ver')
  @Get('lots')
  lots(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.lots(user, unidad);
  }
  @Permisos('lotes.editar')
  @Patch('lots/:id')
  updateLot(@Param('id') id: string, @Body() dto: UpdateLoteDto) {
    return this.operations.updateLot(id, dto);
  }
  @Permisos('productos.ver')
  @Get('product-types')
  productTypes() {
    return this.operations.productTypes();
  }
  @Permisos('productos.editar')
  @Post('product-types')
  createProductType(@Body() dto: CreateProductTypeDto) {
    return this.operations.createProductType(dto);
  }
  @Permisos('almacenes.ver')
  @Get('warehouses')
  warehouses(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.warehouses(user, unidad);
  }
  @Permisos('almacenes.crear')
  @Post('warehouses')
  createWarehouse(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOperationalWarehouseDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.createWarehouse(dto, user, unidad);
  }

  @Permisos('ventas.ver')
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
  @Permisos('ventas.ver')
  @Get('sales/:id')
  sale(@Param('id') id: string, @CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.sale(id, user, unidad);
  }
  // Registrar una venta es un solo paso: queda confirmada de inmediato (descuenta stock y
  // genera kardex en la misma operación), sin un paso de confirmación aparte.
  @Permisos('ventas.registrar')
  @Post('sales')
  createSale(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOperationalSaleDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.createSale(dto, user, unidad);
  }
  @Permisos('ventas.editar')
  @Patch('sales/:id')
  updateSale(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOperationalSaleDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.updateSale(id, dto, user, unidad);
  }

  @Permisos('stock.ver')
  @Get('stock')
  stock(
    @CurrentUser() user: AuthUser,
    @Query('almacenId') almacenId?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.stock(user, almacenId, unidad);
  }
  @Permisos('kardex.ver')
  @Get('movements')
  movements(
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
  @Permisos('kardex.ver')
  @Get('kardex')
  kardex(
    @CurrentUser() user: AuthUser,
    @Query('productoId') productoId?: string,
    @Query('almacenId') almacenId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.kardex(user, { productoId, almacenId, from, to }, unidad);
  }

  @Permisos('devoluciones.ver')
  @Get('returns')
  returns(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.operations.returns(user, unidad);
  }
  @Permisos('devoluciones.registrar')
  @Post('returns/:type')
  createReturn(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Body() dto: CreateReturnDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.operations.createReturn(type, dto, user, unidad);
  }

  @Permisos('metodosPago.ver')
  @Get('payment-methods')
  paymentMethods(@CurrentUser() user: AuthUser, @Query('trabajadorId') trabajadorId?: string) {
    return this.operations.paymentMethods(user, trabajadorId);
  }
  @Permisos('metodosPago.ver')
  @Get('payment-method-categories')
  paymentMethodCategories() {
    return this.operations.paymentMethodCategories();
  }
  @Permisos('metodosPago.crearPropio')
  @Post('payment-methods')
  createOwnPaymentMethod(@CurrentUser() user: AuthUser, @Body() dto: CreateOwnPaymentMethodDto) {
    return this.operations.createOwnPaymentMethod(user, dto);
  }
  // Solo queda el tipo "cobrar" (cuentas por pagar desapareció junto con Compras); se
  // conserva el segmento :type en la ruta para no romper el cliente existente.
  @Permisos('cobranzas.ver')
  @Get('accounts/:type')
  accounts(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Query('clienteId') clienteId?: string,
    @UnidadQuery() unidad?: string,
  ) {
    if (type !== 'cobrar') throw new BadRequestException('Tipo de cuenta inválido');
    return this.operations.accounts(user, clienteId, unidad);
  }
  @Permisos('cobranzas.registrar')
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
  @Permisos('cobranzas.registrar')
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
