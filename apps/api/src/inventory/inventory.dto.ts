import { InventoryMovementType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateInventoryMovementDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsEnum(InventoryMovementType)
  type: InventoryMovementType;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  emptyContainersDelta?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
