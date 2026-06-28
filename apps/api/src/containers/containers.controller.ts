import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../common/auth-user";
import { AdjustContainerDto } from "./containers.dto";
import { ContainersService } from "./containers.service";

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.DELIVERY, RoleName.WAREHOUSE)
@Controller("containers")
export class ContainersController {
  constructor(private readonly containers: ContainersService) {}

  @Get("pending")
  pending() {
    return this.containers.pendingClients();
  }

  @Get("movements")
  movements(@Query("clientId") clientId?: string) {
    return this.containers.movements(clientId);
  }

  @Roles(RoleName.ADMIN, RoleName.WAREHOUSE)
  @Post("adjust")
  adjust(@CurrentUser() user: AuthUser, @Body() dto: AdjustContainerDto) {
    return this.containers.adjust(dto, user.userId);
  }
}
