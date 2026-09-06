import { Controller, Get, Param } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { ConsultaDocumentoService } from './consulta-documento.service';

// Los cuatro roles pueden registrar clientes o proveedores, así que todos pueden consultar.
@Roles(RoleName.ADMIN, RoleName.SELLER, RoleName.DELIVERY, RoleName.WAREHOUSE)
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
