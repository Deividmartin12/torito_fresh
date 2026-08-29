import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CreateClientDto, UpdateClientDto } from './clients.dto';
import { ClientsService } from './clients.service';

@Roles(RoleName.ADMIN, RoleName.SELLER)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  // El rol DELIVERY puede leer y crear clientes, pero no editarlos ni desactivarlos.
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.DELIVERY)
  @Get()
  list(@Query('search') search?: string, @Query('active') active?: string) {
    return this.clients.list(search, active);
  }

  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.DELIVERY)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.clients.get(id);
  }

  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.DELIVERY)
  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.clients.deactivate(id);
  }
}
