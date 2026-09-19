import { Controller, Get, Param } from '@nestjs/common';
import { Permisos } from '../auth/permisos.decorator';
import { ConsultaDocumentoService } from './consulta-documento.service';

// Todos los roles registran clientes o proveedores, así que todos pueden consultar. Es una
// lectura a un servicio externo: no expone datos de ninguna unidad de negocio.
@Permisos('documento.consultar')
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
