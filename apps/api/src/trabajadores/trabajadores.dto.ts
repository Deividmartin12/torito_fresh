import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

const CARGOS = ['Administrador', 'Almacenero', 'Vendedor', 'Repartidor'] as const;

export class CreateTrabajadorDto {
  @IsString()
  @MaxLength(20)
  tipoDocumento: string;

  @IsString()
  @Matches(/\S/, { message: 'El número de documento es obligatorio' })
  @MaxLength(20)
  numeroDocumento: string;

  @IsString()
  @Matches(/\S/, { message: 'Los nombres son obligatorios' })
  @MaxLength(100)
  nombres: string;

  @IsString()
  @Matches(/\S/, { message: 'Los apellidos son obligatorios' })
  @MaxLength(100)
  apellidos: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsEmail({}, { message: 'El correo no tiene un formato valido' })
  @MaxLength(150)
  correo?: string;

  @IsIn(CARGOS, { message: 'Selecciona un cargo valido' })
  cargo: string;
}

export class UpdateTrabajadorDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tipoDocumento?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'El número de documento es obligatorio' })
  @MaxLength(20)
  numeroDocumento?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'Los nombres son obligatorios' })
  @MaxLength(100)
  nombres?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'Los apellidos son obligatorios' })
  @MaxLength(100)
  apellidos?: string;

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
  @IsIn(CARGOS, { message: 'Selecciona un cargo valido' })
  cargo?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
