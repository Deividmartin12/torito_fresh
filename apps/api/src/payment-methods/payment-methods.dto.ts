import { IsBoolean, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { RE_ETIQUETA_PAGO } from '../common/validacion';

const MSG_ETIQUETA = 'El nombre solo puede tener letras, números, espacios y . & / -';

export class CreatePaymentMethodDto {
  @IsString()
  @Matches(/\S/, { message: 'Selecciona la categoría del método de pago' })
  categoriaId: string;

  // Etiqueta libre opcional ("Yape del negocio"). Si no va, el nombre visible sale de la
  // categoría más la referencia.
  @IsOptional()
  @ValidateIf((_object, value) => value !== '' && value != null)
  @IsString()
  @MaxLength(50)
  @Matches(RE_ETIQUETA_PAGO, { message: MSG_ETIQUETA })
  nombre?: string;

  // El número de Yape/Plin o la cuenta bancaria. Obligatorio si la categoría lo exige.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referencia?: string;

  // Dueño del método. Vacío = disponible para todos los trabajadores (caso Efectivo).
  @IsOptional()
  @IsString()
  trabajadorId?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'Selecciona la categoría del método de pago' })
  categoriaId?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '' && value != null)
  @IsString()
  @MaxLength(50)
  @Matches(RE_ETIQUETA_PAGO, { message: MSG_ETIQUETA })
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  referencia?: string;

  @IsOptional()
  @IsString()
  trabajadorId?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class CreatePaymentMethodCategoryDto {
  @IsString()
  @Matches(/\S/, { message: 'El nombre de la categoría es obligatorio' })
  @MaxLength(50)
  @Matches(RE_ETIQUETA_PAGO, { message: MSG_ETIQUETA })
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  icono?: string;

  @IsOptional()
  @IsBoolean()
  requiereReferencia?: boolean;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdatePaymentMethodCategoryDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'El nombre de la categoría es obligatorio' })
  @MaxLength(50)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  icono?: string;

  @IsOptional()
  @IsBoolean()
  requiereReferencia?: boolean;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
