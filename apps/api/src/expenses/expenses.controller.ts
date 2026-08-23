import { Body, Controller, Get, Post } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { CreateExpenseDto } from "./expenses.dto";
import { ExpensesService } from "./expenses.service";

@Roles(RoleName.ADMIN, RoleName.SELLER)
@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list() { return this.expenses.list(); }

  @Post()
  create(@Body() dto: CreateExpenseDto) { return this.expenses.create(dto); }
}
