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
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EsNombreLibre } from '../common/validators';

export const ESTADOS_LOTE = ['ACTIVO', 'VENCIDO', 'AGOTADO', 'BLOQUEADO'] as const;

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

  // A nombre de quién queda la operación. Solo un ADMIN puede mandarlo; el resto siempre
  // registra a su propio nombre. La regla vive en `resolverTrabajadorAutor`, no acá, porque
  // class-validator no ve el rol del usuario.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  trabajadorId?: number;

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

  // Reasignar el vendedor al editar: solo ADMIN. Si no viene, se conserva el original.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  trabajadorId?: number;

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
  @EsNombreLibre(120)
  nombre: string;

  @IsString()
  @MaxLength(50)
  tipo: string;

  @IsString()
  @MaxLength(30)
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
  @EsNombreLibre(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tipo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
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

export class CreateOwnPaymentMethodDto {
  @IsString()
  @Matches(/\S/, { message: 'Selecciona la categoría del método de pago' })
  categoriaId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  referencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nombre?: string;

  // Solo lo usa un ADMIN para registrar a nombre de otro; el resto siempre queda a su nombre.
  @IsOptional()
  @IsString()
  trabajadorId?: string;
}

export class CreateProductTypeDto {
  @IsString()
  @Matches(/\S/, { message: 'El nombre del tipo de producto es obligatorio' })
  @MaxLength(50)
  nombre: string;
}

export class CreateOperationalWarehouseDto {
  @EsNombreLibre(80)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
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

  // Quién cobra. Solo ADMIN puede cobrar a nombre de otro (p. ej. al Yape de un repartidor).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  trabajadorId?: number;

  @IsOptional()
  @IsDateString()
  fechaPago?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
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
  @IsBoolean()
  reintegraInventario?: boolean;
}

export class CreateReturnDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  operacionId: number;

  @IsString()
  @Matches(/\S/, { message: 'El motivo de la devolución es obligatorio' })
  @MaxLength(300)
  motivo: string;

  // Quién registra la devolución. Solo ADMIN puede hacerlo a nombre de otro.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  trabajadorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];
}

// Los lotes nacen automáticamente al completar una producción; esto solo permite corregir
// sus fechas o bloquearlos/reactivarlos a mano. El código y el costo no se tocan porque el
// kardex y los reportes ya están calculados con esos valores.
export class UpdateLoteDto {
  // `null` o cadena vacía = quitar la fecha.
  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsDateString()
  fechaProduccion?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsDateString()
  fechaVencimiento?: string | null;

  @IsOptional()
  @IsIn(ESTADOS_LOTE, { message: 'Selecciona un estado de lote válido' })
  estado?: string;
}
