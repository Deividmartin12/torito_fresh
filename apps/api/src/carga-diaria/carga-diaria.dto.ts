import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Lo vendido en un día con una categoría de pago (Efectivo, Yape...), en soles. */
class VentaDelDiaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoriaId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9_999_999)
  monto: number;
}

class DiaDto {
  @Matches(FECHA, { message: 'La fecha debe tener el formato AAAA-MM-DD' })
  fecha: string;

  /** Bidones producidos ese día. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La producción se carga en bidones enteros' })
  @Min(1)
  @Max(1_000_000)
  produccion?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VentaDelDiaDto)
  ventas?: VentaDelDiaDto[];

  /** Gasto total del día, en soles. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9_999_999)
  gasto?: number;
}

export class RegistrarCargaDiariaDto {
  /** El producto que se produce y se vende en estos días. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId: number;

  @IsArray()
  @ArrayMinSize(1)
  // Un rango de ~dos meses: lo que muestra la grilla. Más que eso ya no es una carga, es una
  // migración, y conviene partirla.
  @ArrayMaxSize(93)
  @ValidateNested({ each: true })
  @Type(() => DiaDto)
  dias: DiaDto[];
}

export type DiaCarga = DiaDto;
