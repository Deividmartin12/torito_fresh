import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseCategoryDto,
} from './expenses.dto';
import { ExpensesService } from './expenses.service';

@Roles(RoleName.ADMIN, RoleName.SELLER)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list() {
    return this.expenses.list();
  }

  @Get('categories')
  categories() {
    return this.expenses.categories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateExpenseCategoryDto) {
    return this.expenses.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.expenses.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.expenses.deleteCategory(id);
  }

  @Post()
  create(@Body() dto: CreateExpenseDto) {
    return this.expenses.create(dto);
  }
}
