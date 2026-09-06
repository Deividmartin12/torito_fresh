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

  // Cantidad en unidades enteras: las ventas siempre usan enteros positivos (>= 1).
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioUnitario: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descuento?: number;
}

// Una línea del cobro inicial: un método (efectivo, Yape, tarjeta...) con su monto.
// La venta puede repartir el cobro entre varias (p. ej. una parte en efectivo y otra en Yape).
class InitialPaymentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  metodoPagoId: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;
}

class BaseOperationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  almacenId: number;

  @IsIn(['CONTADO', 'CREDITO', 'MIXTO'])
  tipoPago: string;

  // Métodos con los que se cobra al momento de la venta. En CONTADO deben sumar el total;
  // en MIXTO suman el abono inicial; en CREDITO va vacío.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialPaymentDto)
  pagosIniciales?: InitialPaymentDto[];

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descuento?: number;

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InitialPaymentDto)
  pagosIniciales?: InitialPaymentDto[];

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  // Fecha de emisión de la venta. Solo se toma al editar; al registrar es el día actual.
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  descuento?: number;

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

// Edición de un producto ya creado. El código no se toca (es la referencia estable);
// el resto de datos sí. Todos los campos son opcionales: se actualiza solo lo que llega.
export class UpdateOperationalProductDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  unidad?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  capacidadLitros?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precio?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costo?: number;

  @IsOptional()
  @IsBoolean()
  controlaLote?: boolean;

  @IsOptional()
  @IsBoolean()
  esRetornable?: boolean;
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

  // Igual que la venta: unidades enteras positivas.
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
