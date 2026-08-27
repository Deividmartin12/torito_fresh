import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString()
  @Matches(/\S/, { message: 'El nombre es obligatorio' })
  @MaxLength(50)
  nombre: string;

  @IsOptional()
  @IsBoolean()
  requiereOperacion?: boolean;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'El nombre es obligatorio' })
  @MaxLength(50)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  requiereOperacion?: boolean;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
