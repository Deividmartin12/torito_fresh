import { RoleName } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RE_USERNAME } from '../common/validacion';
import { EsNombrePersona } from '../common/validators';

const ROLES = Object.values(RoleName);

export class CreateUserDto {
  @EsNombrePersona(150)
  name: string;

  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  @MaxLength(150)
  email: string;

  @IsString()
  @MinLength(2, { message: 'El nombre de usuario es muy corto' })
  @MaxLength(50)
  @Matches(RE_USERNAME, {
    message: 'El usuario solo puede tener letras, números, punto, guion y guion bajo',
  })
  username: string;

  @IsString()
  @MinLength(4, { message: 'La contraseña debe tener al menos 4 caracteres' })
  password: string;

  @IsIn(ROLES, { message: 'Selecciona un rol válido' })
  role: RoleName;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @EsNombrePersona(150)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre de usuario es muy corto' })
  @MaxLength(50)
  @Matches(RE_USERNAME, {
    message: 'El usuario solo puede tener letras, números, punto, guion y guion bajo',
  })
  username?: string;

  // Reseteo hecho por un administrador: a diferencia de /auth/change-password, no pide la
  // contraseña actual porque quien la cambia no es el dueño de la cuenta.
  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'La contraseña debe tener al menos 4 caracteres' })
  password?: string;

  @IsOptional()
  @IsIn(ROLES, { message: 'Selecciona un rol válido' })
  role?: RoleName;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
