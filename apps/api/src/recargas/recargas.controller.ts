import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { RecargasService } from './recargas.service';

@Permisos('recargas.ver')
@Controller('recargas')
export class RecargasController {
  constructor(private readonly recargas: RecargasService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @UnidadQuery() unidad?: string) {
    return this.recargas.list(user, unidad);
  }
}
