import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  // `TrabajadoresService` lo usa para crear la cuenta al vincularla con un trabajador.
  exports: [UsersService],
})
export class UsersModule {}
