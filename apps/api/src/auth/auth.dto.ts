import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** Nombre de usuario o correo. */
  @IsString()
  email: string;

  @IsString()
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
