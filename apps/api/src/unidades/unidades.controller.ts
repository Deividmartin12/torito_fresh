import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { AuthUser } from '../common/auth-user';
import {
  CreateUnidadNegocioDto,
  UnidadesVisiblesDto,
  UpdateUnidadNegocioDto,
} from './unidades.dto';
import { UnidadesService } from './unidades.service';

// El @Roles de clase es obligatorio: sin ninguno, RolesGuard deja pasar a cualquier
// autenticado y un socio podría crear unidades.
@Roles(RoleName.ADMIN)
@Controller('unidades')
export class UnidadesController {
  constructor(private readonly unidades: UnidadesService) {}

  // La única ruta abierta al resto de los roles: alimenta el selector de unidad. Cada quien
  // recibe solo la suya, así que no filtra nada que no pueda ver igual.
  @Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.WAREHOUSE, RoleName.DELIVERY, RoleName.SOCIO)
  @Get('mias')
  mias(@CurrentUser() user: AuthUser) {
    return this.unidades.propias(user);
  }

  // Va antes de `:id` a propósito: si no, "visibles" entraría por ahí como si fuera un id.
  @Get('visibles')
  visibles(@CurrentUser() user: AuthUser) {
    return this.unidades.visibles(user);
  }

  @Put('visibles')
  guardarVisibles(@CurrentUser() user: AuthUser, @Body() dto: UnidadesVisiblesDto) {
    return this.unidades.guardarVisibles(user, dto);
  }

  @Get()
  list() {
    return this.unidades.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.unidades.get(id);
  }

  @Post()
  create(@Body() dto: CreateUnidadNegocioDto) {
    return this.unidades.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUnidadNegocioDto) {
    return this.unidades.update(id, dto);
  }
}
