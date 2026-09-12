import { Module } from '@nestjs/common';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [PaymentMethodsModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
