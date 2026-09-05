import { Module } from '@nestjs/common';
import { BidonesRotosController } from './bidones-rotos.controller';
import { BidonesRotosService } from './bidones-rotos.service';

@Module({ controllers: [BidonesRotosController], providers: [BidonesRotosService] })
export class BidonesRotosModule {}
