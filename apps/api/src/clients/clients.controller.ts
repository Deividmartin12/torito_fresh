import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { CreateClientDto, UpdateClientDto } from "./clients.dto";
import { ClientsService } from "./clients.service";

@Roles(RoleName.ADMIN, RoleName.SELLER)
@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Query("search") search?: string, @Query("active") active?: string) {
    return this.clients.list(search, active);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.clients.get(id);
  }

  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  @Patch(":id/deactivate")
  deactivate(@Param("id") id: string) {
    return this.clients.deactivate(id);
  }
}
