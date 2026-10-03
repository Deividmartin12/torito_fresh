import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Permisos } from '../auth/permisos.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../common/auth-user';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Permisos('trabajadores.administrar')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query('disponibles') disponibles?: string) {
    return this.users.list(disponibles);
  }

  /**
   * Los roles que se le pueden asignar a una cuenta: los activos, con su nombre en pantalla.
   *
   * Sale de la base y no de un enum, que es el cambio de fondo: un rol creado en
   * Configuración › Roles y permisos aparece acá solo, sin tocar código.
   */
  @Get('roles')
  roles() {
    return this.users.rolesAsignables();
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, undefined, actor);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, undefined, actor);
  }
}
