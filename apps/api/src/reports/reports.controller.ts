import { Controller, Get, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { ReportsService } from "./reports.service";

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("dashboard")
  dashboard() {
    return this.reports.dashboard();
  }

  @Get("sales")
  sales(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reports.salesByPeriod(from, to);
  }

  @Get("top-products")
  topProducts() {
    return this.reports.topProducts();
  }

  @Get("frequent-clients")
  frequentClients() {
    return this.reports.frequentClients();
  }

  @Get("debts")
  debts() {
    return this.reports.debts();
  }

  @Get("containers-pending")
  containersPending() {
    return this.reports.containersPending();
  }

  @Get("pending-orders")
  pendingOrders() {
    return this.reports.pendingOrders();
  }

  @Get("sales-by-delivery")
  salesByDelivery() {
    return this.reports.salesByDelivery();
  }
}
