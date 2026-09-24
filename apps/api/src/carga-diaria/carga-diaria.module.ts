import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations/operations.module';
import { ProductionModule } from '../production/production.module';
import { CargaDiariaController } from './carga-diaria.controller';
import { CargaDiariaService } from './carga-diaria.service';

@Module({
  imports: [OperationsModule, ProductionModule],
  controllers: [CargaDiariaController],
  providers: [CargaDiariaService],
})
export class CargaDiariaModule {}
