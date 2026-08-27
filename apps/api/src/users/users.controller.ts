import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Roles(RoleName.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query('role') role?: RoleName) {
    return this.users.list(role);
  }

  @Get('roles')
  roles() {
    return this.users.roles();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Patch(':id/active')
  active(@Param('id') id: string, @Body() dto: { active: boolean }) {
    return this.users.setActive(id, dto.active);
  }
}
