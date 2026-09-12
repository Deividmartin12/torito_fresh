import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import {
  CreatePaymentMethodCategoryDto,
  CreatePaymentMethodDto,
  UpdatePaymentMethodCategoryDto,
  UpdatePaymentMethodDto,
} from './payment-methods.dto';
import { PaymentMethodsService } from './payment-methods.service';

@Roles(RoleName.ADMIN)
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethods: PaymentMethodsService) {}

  // Las rutas de categorías van antes que `:id` para que "categories" no se lea como un id.
  @Get('categories')
  categories() {
    return this.paymentMethods.categories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreatePaymentMethodCategoryDto) {
    return this.paymentMethods.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdatePaymentMethodCategoryDto) {
    return this.paymentMethods.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.paymentMethods.deleteCategory(id);
  }

  @Get()
  list(@Query('trabajadorId') trabajadorId?: string) {
    return this.paymentMethods.list(trabajadorId);
  }

  @Post()
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.paymentMethods.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.paymentMethods.update(id, dto);
  }
}
