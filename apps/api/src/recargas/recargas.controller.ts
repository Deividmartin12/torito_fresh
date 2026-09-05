import { Controller, Get } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RecargasService } from './recargas.service';

@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE)
@Controller('recargas')
export class RecargasController {
  constructor(private readonly recargas: RecargasService) {}

  @Get()
  list() {
    return this.recargas.list();
  }
}
