import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../common/auth-user";
import { RegisterPaymentDto } from "./payments.dto";
import { PaymentsService } from "./payments.service";

@Roles(RoleName.ADMIN, RoleName.SELLER)
@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@Query("clientId") clientId?: string) {
    return this.payments.list(clientId);
  }

  @Get("debts")
  debts() {
    return this.payments.debts();
  }

  @Post()
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterPaymentDto) {
    return this.payments.register(dto, user.userId);
  }
}
