import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from "./payment-methods.dto";
import { PaymentMethodsService } from "./payment-methods.service";

@Roles(RoleName.ADMIN)
@Controller("payment-methods")
export class PaymentMethodsController {
  constructor(private readonly paymentMethods: PaymentMethodsService) {}

  @Get()
  list() { return this.paymentMethods.list(); }

  @Post()
  create(@Body() dto: CreatePaymentMethodDto) { return this.paymentMethods.create(dto); }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePaymentMethodDto) { return this.paymentMethods.update(id, dto); }
}
