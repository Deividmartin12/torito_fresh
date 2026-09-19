import { Controller, Get, Param } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { ConsultaDocumentoService } from './consulta-documento.service';

// Todos los roles registran clientes o proveedores, así que todos pueden consultar. Es una
// lectura a un servicio externo: no expone datos de ninguna unidad de negocio.
@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.DELIVERY, RoleName.WAREHOUSE, RoleName.SOCIO)
@Controller('consulta-documento')
export class ConsultaDocumentoController {
  constructor(private readonly consulta: ConsultaDocumentoService) {}

  @Get('dni/:numero')
  dni(@Param('numero') numero: string) {
    return this.consulta.consultarDni(numero);
  }

  @Get('ruc/:numero')
  ruc(@Param('numero') numero: string) {
    return this.consulta.consultarRuc(numero);
  }
}
