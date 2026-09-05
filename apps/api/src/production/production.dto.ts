import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

class ProductionInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  cantidad: number;
}

export class CreateProductionOrderDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  almacenProductoTerminadoId?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  cantidadPlanificada: number;

  @IsDateString()
  fechaPlanificada: string;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionInputDto)
  insumos?: ProductionInputDto[];
}
