import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, NotEquals } from 'class-validator';

export class AdjustContainerDto {
  @IsString()
  clientId: string;

  // Positivo = entrega de envases al cliente; negativo = retorno de vacíos. Nunca 0.
  @Type(() => Number)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @NotEquals(0, { message: 'La cantidad no puede ser 0' })
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
