import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** Nombre de usuario o correo. */
  @IsString()
  @IsNotEmpty({ message: 'Ingresa tu usuario o correo' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Ingresa tu contraseña' })
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
