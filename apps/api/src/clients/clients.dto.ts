import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { EsCelular, EsDocumento, EsNombreLibre } from '../common/validators';

const TIPOS_DOCUMENTO = ['DNI', 'RUC', 'CE', 'PAS'] as const;

export class CreateClientDto {
  @EsNombreLibre(150)
  name: string;

  @IsOptional()
  @IsIn(TIPOS_DOCUMENTO, { message: 'Selecciona un tipo de documento válido' })
  documentType?: string;

  @IsOptional()
  @EsDocumento()
  document?: string;

  @EsCelular()
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  reference?: string;

  /**
   * Cuánto se le puede fiar, en soles. Vacío (null) = sin límite; 0 = no se le vende a
   * crédito. Son cosas opuestas, así que el `@ValidateIf` deja pasar el null explícito en
   * vez de rechazarlo como "no es un número".
   */
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit?: number | null;
}

export class UpdateClientDto {
  @IsOptional()
  @EsNombreLibre(150)
  name?: string;

  @IsOptional()
  @IsIn(TIPOS_DOCUMENTO, { message: 'Selecciona un tipo de documento válido' })
  documentType?: string;

  @IsOptional()
  @EsDocumento()
  document?: string;

  @EsCelular({ opcional: true })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  reference?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /**
   * Cuánto se le puede fiar, en soles. Vacío (null) = sin límite; 0 = no se le vende a
   * crédito. Son cosas opuestas, así que el `@ValidateIf` deja pasar el null explícito en
   * vez de rechazarlo como "no es un número".
   */
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit?: number | null;
}
