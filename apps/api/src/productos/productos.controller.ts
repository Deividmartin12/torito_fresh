import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { CreateProductoDto, UpdateProductoDto } from "./productos.dto";
import { ProductosService } from "./productos.service";

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
@Controller("productos")
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  @Get()
  list(@Query("search") search?: string, @Query("active") active?: string) {
    return this.productos.list(search, active);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.productos.get(id);
  }

  @Post()
  create(@Body() dto: CreateProductoDto) {
    return this.productos.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProductoDto) {
    return this.productos.update(id, dto);
  }

  @Patch(":id/deactivate")
  deactivate(@Param("id") id: string) {
    return this.productos.deactivate(id);
  }
}
