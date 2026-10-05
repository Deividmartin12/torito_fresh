import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AperturaCajaDto {
  @IsString() @Matches(/^[1-9]\d*$/) metodoPagoId: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d*$/) unidadNegocioId?: string;
  @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/) fecha: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-9999999999.99)
  @Max(9999999999.99)
  saldoInicial: number;
}
export class MovimientoCajaDto {
  @IsString() @Matches(/^[1-9]\d*$/) cuentaId: string;
  @IsIn(['APORTE', 'DEPOSITO', 'RETIRO']) tipo: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  monto: number;
  @IsOptional() @IsDateString() fecha?: string;
  @IsString() @Matches(/\S/) @MaxLength(400) motivo: string;
  @IsUUID() operacionId: string;
}
export class TransferenciaCajaDto {
  @IsString() @Matches(/^[1-9]\d*$/) origenId: string;
  @IsString() @Matches(/^[1-9]\d*$/) destinoId: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  monto: number;
  @IsOptional() @IsDateString() fecha?: string;
  @IsString() @Matches(/\S/) @MaxLength(400) motivo: string;
  @IsUUID() operacionId: string;
}
export class AjusteCajaDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-9999999999.99)
  @Max(9999999999.99)
  saldoNuevo: number;
  @Type(() => Number) @IsInt() @Min(0) version: number;
  @IsString() @Matches(/\S/) @MaxLength(400) motivo: string;
  @IsUUID() operacionId: string;
}
