import { Module } from '@nestjs/common';
import { RecargasController } from './recargas.controller';
import { RecargasService } from './recargas.service';

@Module({ controllers: [RecargasController], providers: [RecargasService] })
export class RecargasModule {}
