import { Controller, Get } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { RecargasService } from './recargas.service';

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
@Controller('recargas')
export class RecargasController {
  constructor(private readonly recargas: RecargasService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.recargas.list(user, unidad);
  }
}
