import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../common/auth-user";
import { CompleteDeliveryDto } from "./deliveries.dto";
import { DeliveriesService } from "./deliveries.service";

@Roles(RoleName.ADMIN, RoleName.DELIVERY)
@Controller("deliveries")
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  list(@Query("deliveryUserId") deliveryUserId?: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.deliveries.list({ deliveryUserId, from, to });
  }

  @Post("complete")
  complete(@CurrentUser() user: AuthUser, @Body() dto: CompleteDeliveryDto) {
    return this.deliveries.complete(dto, user);
  }
}
