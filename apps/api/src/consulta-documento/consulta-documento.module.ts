import { Module } from '@nestjs/common';
import { ConsultaDocumentoController } from './consulta-documento.controller';
import { ConsultaDocumentoService } from './consulta-documento.service';

@Module({
  controllers: [ConsultaDocumentoController],
  providers: [ConsultaDocumentoService],
})
export class ConsultaDocumentoModule {}
