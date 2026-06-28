import { OrderStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateOrderItemDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @Min(1)
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  unitPrice?: number;
}

export class CreateOrderDto {
  @IsString()
  clientId: string;

  @IsOptional()
  @IsString()
  deliveryUserId?: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  observations?: string;
}

export class AssignDeliveryDto {
  @IsString()
  deliveryUserId: string;
}
