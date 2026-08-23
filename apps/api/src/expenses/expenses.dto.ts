import { Type } from "class-transformer";
import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateExpenseDto {
  @IsDateString()
  fecha: string;

  @IsString()
  @MaxLength(200)
  concepto: string;

  @IsString()
  @MaxLength(100)
  categoria: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  comprobante?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
