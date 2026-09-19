import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
import { AuthUser } from '../common/auth-user';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto';
import { RolesService } from './roles.service';

// El permiso de clase es obligatorio: sin ninguno, PermisosGuard deja pasar a cualquier
// autenticado, y acá eso significaría que cualquiera se regala los permisos que quiera.
@Permisos('roles.administrar')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  // Va antes de `:id` a propósito: si no, "catalogo" entraría por ahí como si fuera un id.
  @Get('catalogo')
  catalogo() {
    return this.roles.catalogo();
  }

  @Get()
  list() {
    return this.roles.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.roles.get(id);
  }

  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: AuthUser) {
    return this.roles.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.roles.remove(id, user);
  }
}
