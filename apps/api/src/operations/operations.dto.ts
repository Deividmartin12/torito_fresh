import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

class OperationItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  loteId?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  cantidad: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioUnitario: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descuento?: number;
}

class BaseOperationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  almacenId: number;

  @IsIn(["FACTURA", "BOLETA", "NOTA"])
  tipoComprobante: string;

  @IsString()
  serie: string;

  @IsString()
  numero: string;

  @IsIn(["CONTADO", "CREDITO", "MIXTO"])
  tipoPago: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descuento?: number;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OperationItemDto)
  items: OperationItemDto[];
}

export class CreatePurchaseDto extends BaseOperationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  proveedorId: number;
}

export class CreateOperationalSaleDto extends BaseOperationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clienteId: number;
}
