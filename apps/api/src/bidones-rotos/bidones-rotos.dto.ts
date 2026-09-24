import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateBidonRotoDto {
  @IsDateString()
  fecha: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;

  /**
   * Qué producto se rompió y de qué almacén sale. Son opcionales porque una unidad que no
   * lleva inventario no tiene de dónde descontar, y porque sin producto la rotura sigue
   * siendo un dato válido: queda como registro, igual que las de antes de esta función.
   */
  @IsOptional()
  @IsString()
  productoId?: string;

  @IsOptional()
  @IsString()
  almacenId?: string;
}
