import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { CreateOperationalSaleDto, CreatePurchaseDto } from "./operations.dto";
import { OperationsService } from "./operations.service";

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
@Controller("operations")
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("catalogs") catalogs() { return this.operations.catalogs(); }
  @Get("purchases") purchases() { return this.operations.purchases(); }
  @Post("purchases") createPurchase(@Body() dto: CreatePurchaseDto, @Query("confirm") confirm?: string) { return this.operations.createPurchase(dto, confirm === "true"); }
  @Post("purchases/:id/confirm") confirmPurchase(@Param("id") id: string) { return this.operations.confirmPurchase(id); }

  @Get("sales") sales() { return this.operations.sales(); }
  @Post("sales") createSale(@Body() dto: CreateOperationalSaleDto, @Query("confirm") confirm?: string) { return this.operations.createSale(dto, confirm === "true"); }
  @Post("sales/:id/confirm") confirmSale(@Param("id") id: string) { return this.operations.confirmSale(id); }

  @Get("stock") stock(@Query("almacenId") almacenId?: string) { return this.operations.stock(almacenId); }
  @Get("movements") movements() { return this.operations.movements(); }
}
