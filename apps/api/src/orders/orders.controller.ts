import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { OrderStatus, RoleName } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../common/auth-user";
import { AssignDeliveryDto, CreateOrderDto, UpdateOrderStatusDto } from "./orders.dto";
import { OrdersService } from "./orders.service";

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.DELIVERY)
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @Query("status") status?: OrderStatus,
    @Query("deliveryUserId") deliveryUserId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.orders.list({ status, deliveryUserId, from, to });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.orders.get(id);
  }

  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(dto, user.userId);
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.updateStatus(id, dto);
  }

  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @Patch(":id/assign")
  assign(@Param("id") id: string, @Body() dto: AssignDeliveryDto) {
    return this.orders.assignDelivery(id, dto);
  }

  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @Patch(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.orders.cancel(id);
  }
}
