import { Controller, Get, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { AuthUser } from '../common/auth-user';
import { ReportsService } from './reports.service';

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('business')
  business(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.business(from, to);
  }

  // Panel simple para el repartidor: sus ventas registradas hoy.
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY)
  @Get('delivery-summary')
  deliverySummary(@CurrentUser() user: AuthUser) {
    return this.reports.deliverySummary(user.userId);
  }
}
