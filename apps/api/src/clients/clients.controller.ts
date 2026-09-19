import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { CreateClientDto, UpdateClientDto } from './clients.dto';
import { ClientsService } from './clients.service';

@Permisos('clientes.editar')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  // El rol DELIVERY puede leer y crear clientes, pero no editarlos ni desactivarlos.
  @Permisos('clientes.ver')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @UnidadQuery() unidad?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
  ) {
    return this.clients.list(user, search, active, unidad);
  }

  @Permisos('clientes.ver')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.clients.get(id, user, unidad);
  }

  @Permisos('clientes.crear')
  @Post()
  create(
    @Body() dto: CreateClientDto,
    @CurrentUser() user: AuthUser,
    @UnidadQuery() unidad?: string,
  ) {
    return this.clients.create(dto, user, unidad);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthUser,
    @UnidadQuery() unidad?: string,
  ) {
    return this.clients.update(id, dto, user, unidad);
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UnidadQuery() unidad?: string,
  ) {
    return this.clients.deactivate(id, user, unidad);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.clients.activate(id, user, unidad);
  }
}
