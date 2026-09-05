import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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

  @IsOptional()
  @IsString()
  proveedorId?: string;
}

// Mismos campos que CreateExpenseDto, escritos a mano (el proyecto no usa
// @nestjs/mapped-types/PartialType en ningún otro lado): todos opcionales, se actualiza solo
// lo que venga en el body.
export class UpdateExpenseDto {
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  concepto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoria?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  comprobante?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsString()
  proveedorId?: string;
}

export class CreateExpenseCategoryDto {
  @IsString()
  @MaxLength(100)
  categoria: string;
}

export class UpdateExpenseCategoryDto {
  @IsString()
  @MaxLength(100)
  categoria: string;
}
