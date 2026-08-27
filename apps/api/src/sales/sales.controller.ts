import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { AuthUser } from '../common/auth-user';
import { CreateSaleFromOrderDto } from './sales.dto';
import { SalesService } from './sales.service';

@Roles(RoleName.ADMIN, RoleName.SELLER)
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.sales.list({ from, to, clientId });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.sales.get(id);
  }

  @Post('from-order')
  createFromOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleFromOrderDto) {
    return this.sales.createFromOrder(dto, user.userId);
  }
}
