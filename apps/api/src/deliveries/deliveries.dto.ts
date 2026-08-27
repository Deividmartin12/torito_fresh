import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Min } from 'class-validator';

export class CompleteDeliveryDto {
  @IsString()
  orderId: string;

  @IsOptional()
  @IsString()
  deliveryUserId?: string;

  @Type(() => Number)
  @Min(0)
  containersDelivered: number;

  @Type(() => Number)
  @Min(0)
  containersReturned: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @Type(() => Number)
  @Min(0)
  paymentReceived: number;

  @IsOptional()
  @IsString()
  observations?: string;
}
