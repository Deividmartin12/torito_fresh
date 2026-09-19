import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permisos } from '../auth/permisos.decorator';
import { UnidadQuery } from '../auth/unidad-query.decorator';
import { AuthUser } from '../common/auth-user';
import { ReportsService } from './reports.service';

@Permisos('reportes.ver')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // `unidadNegocioId` es lo que permite al admin alternar entre la Principal, un puesto
  // satélite y el consolidado. Para cualquier otro rol el parámetro se ignora o se rechaza:
  // la decisión la toma `resolverAlcanceUnidad`, no este controlador.
  @Get('business')
  business(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.reports.business(user, from, to, unidad);
  }

  // Ventas por trabajador (desglosadas por forma de cobro), pagos que recibió y gastos
  // que registró, todo dentro del período.
  @Permisos('reportes.trabajadores')
  @Get('workers')
  workers(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @UnidadQuery() unidad?: string,
  ) {
    return this.reports.workers(user, from, to, unidad);
  }

  // Panel simple para el repartidor: sus ventas registradas hoy. No necesita filtro de
  // unidad porque ya está acotado al trabajador vinculado a la cuenta.
  @Permisos('reportes.reparto')
  @Get('delivery-summary')
  deliverySummary(@CurrentUser() user: AuthUser) {
    return this.reports.deliverySummary(user.userId);
  }
}
