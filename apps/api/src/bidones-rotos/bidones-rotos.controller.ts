import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { AuthUser } from '../common/auth-user';
import { BidonesRotosService } from './bidones-rotos.service';
import { CreateBidonRotoDto } from './bidones-rotos.dto';

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
@Controller('bidones-rotos')
export class BidonesRotosController {
  constructor(private readonly bidonesRotos: BidonesRotosService) {}

  @Get()
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.bidonesRotos.list(from, to);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBidonRotoDto) {
    return this.bidonesRotos.create(dto, user);
  }
}
