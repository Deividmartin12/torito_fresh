import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { AuthUser } from '../common/auth-user';
import { CreateInventoryMovementDto } from './inventory.dto';
import { InventoryService } from './inventory.service';

@Roles(RoleName.ADMIN, RoleName.WAREHOUSE)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('summary')
  summary() {
    return this.inventory.summary();
  }

  @Get('movements')
  movements(@Query('productId') productId?: string) {
    return this.inventory.movements(productId);
  }

  @Post('movements')
  createMovement(@CurrentUser() user: AuthUser, @Body() dto: CreateInventoryMovementDto) {
    return this.inventory.createMovement(dto, user.userId);
  }
}
