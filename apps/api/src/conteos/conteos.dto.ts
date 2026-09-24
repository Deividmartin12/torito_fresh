import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Por qué una posición no coincidía. Lo valida además un CHECK en `constraints.sql`. */
export const MOTIVOS_DIFERENCIA = ['ROTURA', 'MERMA', 'ERROR_DE_CARGA', 'ROBO', 'OTRO'] as const;

export class LineaConteoDto {
  /** La fila de stock que se está contando. Ausente = posición nueva (carga inicial). */
  @IsOptional()
  @IsString()
  stockId?: string;

  @IsString()
  productoId: string;

  @IsOptional()
  @IsString()
  loteId?: string;

  @IsString()
  estadoInventarioId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  contado: number;

  /**
   * El teórico que el operador tenía en pantalla. Es el token de concurrencia: si la posición
   * cambió entre contar y guardar (entró una venta), el servidor lo detecta y avisa en vez de
   * pisar esa venta con un número viejo.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  teorico: number;

  /** A qué costo entran las unidades. Solo se admite en posiciones nuevas. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  costoUnitario?: number;

  @IsOptional()
  @IsIn(MOTIVOS_DIFERENCIA)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nota?: string;
}

export class CreateConteoDto {
  @IsString()
  almacenId: string;

  @IsDateString()
  fecha: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;

  @IsOptional()
  @IsString()
  trabajadorId?: string;

  /** Aplicar la diferencia igual cuando el teórico cambió mientras se contaba. */
  @IsOptional()
  @IsBoolean()
  forzar?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaConteoDto)
  lineas: LineaConteoDto[];
}

export class ConteosQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  almacenId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number;
}
