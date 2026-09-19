import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
} from './expenses.dto';
import { ExpensesService } from './expenses.service';

@Permisos('gastos.ver')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('trabajadorId') trabajadorId?: string,
    @Query('beneficiarioId') beneficiarioId?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.expenses.list(user, from, to, trabajadorId, beneficiarioId, unidad);
  }

  @Get('categories')
  categories() {
    return this.expenses.categories();
  }

  // Crear es aditivo y el responsable de una unidad lo necesita: sin la categoría que le falta
  // no puede registrar su gasto. Renombrar o borrar sí queda arriba, porque eso toca los
  // gastos de todas las unidades.
  @Permisos('gastos.categorias.crear')
  @Post('categories')
  createCategory(@Body() dto: CreateExpenseCategoryDto) {
    return this.expenses.createCategory(dto);
  }

  @Permisos('gastos.categorias.editar')
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.expenses.updateCategory(id, dto);
  }

  @Permisos('gastos.categorias.editar')
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.expenses.deleteCategory(id);
  }

  @Permisos('gastos.registrar')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExpenseDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.expenses.create(dto, user, unidad);
  }

  @Permisos('gastos.registrar')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @UnidadQuery() unidad?: string,
  ) {
    return this.expenses.update(id, dto, user, unidad);
  }
}
