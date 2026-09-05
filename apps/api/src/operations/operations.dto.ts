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
  Min,
  ValidateNested,
} from 'class-validator';

class OperationItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productoId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
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
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  almacenId: number;

  @IsIn(['CONTADO', 'CREDITO', 'MIXTO'])
  tipoPago: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  metodoPagoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  montoInicial?: number;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

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

export class CreateOperationalSaleDto extends BaseOperationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clienteId: number;
}

// Mismos campos que CreateOperationalSaleDto, escritos a mano (el proyecto no usa
// @nestjs/mapped-types/PartialType en ningún otro lado, no se introduce esa dependencia
// nueva solo para esto).
export class UpdateOperationalSaleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clienteId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  almacenId: number;

  @IsIn(['CONTADO', 'CREDITO', 'MIXTO'])
  tipoPago: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  metodoPagoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  montoInicial?: number;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

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

export class CreateOperationalProductDto {
  @IsString()
  nombre: string;

  @IsString()
  tipo: string;

  @IsString()
  unidad: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  capacidadLitros?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precio: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costo: number;

  @IsBoolean()
  controlaLote: boolean;

  @IsBoolean()
  esRetornable: boolean;
}

export class CreateOperationalWarehouseDto {
  @IsString()
  nombre: string;

  @IsString()
  tipo: string;

  @IsOptional()
  @IsString()
  direccion?: string;
}

export class RegisterOperationalPaymentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cuentaId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  metodoPagoId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsOptional()
  @IsDateString()
  fechaPago?: string;

  @IsOptional()
  @IsString()
  numeroOperacion?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class UpdateReceivableDueDateDto {
  @IsDateString()
  fechaVencimiento: string;
}

class ReturnItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  detalleId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estadoDestinoId?: number;

  @IsOptional()
  reintegraInventario?: boolean;
}

export class CreateReturnDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  operacionId: number;

  @IsString()
  motivo: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];
}
