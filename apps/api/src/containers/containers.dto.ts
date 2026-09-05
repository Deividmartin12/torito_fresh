import { Type } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class AdjustContainerDto {
  @IsString()
  clientId: string;

  @Type(() => Number)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
