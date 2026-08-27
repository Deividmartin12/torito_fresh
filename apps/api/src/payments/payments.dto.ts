import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Min } from 'class-validator';

export class RegisterPaymentDto {
  @IsString()
  saleId: string;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @Type(() => Number)
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
