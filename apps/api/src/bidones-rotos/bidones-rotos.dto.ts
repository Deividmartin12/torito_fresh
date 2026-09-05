import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateBidonRotoDto {
  @IsDateString()
  fecha: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;
}
