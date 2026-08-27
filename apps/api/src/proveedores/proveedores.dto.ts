import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateProveedorDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: 'El RUC debe contener exactamente 11 digitos' })
  ruc: string;

  @IsString()
  @Matches(/\S/, { message: 'La razon social es obligatoria' })
  @MaxLength(150)
  razonSocial: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombreComercial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsEmail({}, { message: 'El correo no tiene un formato valido' })
  @MaxLength(150)
  correo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  direccion?: string;
}

export class UpdateProveedorDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: 'El RUC debe contener exactamente 11 digitos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'La razon social es obligatoria' })
  @MaxLength(150)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombreComercial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsEmail({}, { message: 'El correo no tiene un formato valido' })
  @MaxLength(150)
  correo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  direccion?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
