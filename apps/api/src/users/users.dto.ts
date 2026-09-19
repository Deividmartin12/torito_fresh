import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RE_USERNAME } from '../common/validacion';
import { EsNombrePersona } from '../common/validators';

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

  // Clave del rol. Los roles son filas editables, así que la lista válida no se puede fijar
  // acá: que exista lo comprueba el servicio al resolver su id.
  @IsString()
  @MaxLength(40)
  role: string;

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
  @IsString()
  @MaxLength(40)
  role?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
