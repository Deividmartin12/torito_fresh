import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  @IsDateString()
  fecha: string;

  @IsString()
  @Matches(/\S/, { message: 'El concepto del gasto es obligatorio' })
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
  @MaxLength(500)
  observaciones?: string;

  @IsOptional()
  @IsString()
  proveedorId?: string;

  // A nombre de quién queda el gasto. Solo un ADMIN puede mandarlo; el resto registra
  // siempre a su propio nombre. La regla vive en `resolverTrabajadorAutor`.
  @IsOptional()
  @IsString()
  trabajadorId?: string;

  // Con qué se pagó. Debe ser un método global o del trabajador que lo registra.
  @IsOptional()
  @IsString()
  metodoPagoId?: string;

  // A quién se le paga. Obligatorio en la categoría "Pago a trabajador" y rechazado en
  // cualquier otra: ver `ExpensesService.resolverBeneficiario`.
  @IsOptional()
  @IsString()
  beneficiarioId?: string;
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
  @MaxLength(500)
  observaciones?: string;

  @IsOptional()
  @IsString()
  proveedorId?: string;

  @IsOptional()
  @IsString()
  trabajadorId?: string;

  @IsOptional()
  @IsString()
  metodoPagoId?: string;

  @IsOptional()
  @IsString()
  beneficiarioId?: string;
}

export class CreateExpenseCategoryDto {
  @IsString()
  @Matches(/\S/, { message: 'El nombre de la categoría es obligatorio' })
  @MaxLength(100)
  categoria: string;
}

export class UpdateExpenseCategoryDto {
  @IsString()
  @Matches(/\S/, { message: 'El nombre de la categoría es obligatorio' })
  @MaxLength(100)
  categoria: string;
}
