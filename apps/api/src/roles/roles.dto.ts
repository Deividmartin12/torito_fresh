import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { esPermisoConocido } from '../auth/permisos';

/**
 * Rechaza las claves que no están en el catálogo.
 *
 * Importa más de lo que parece: una clave con un error de tipeo se guardaría igual y el rol
 * se vería con el permiso marcado en la pantalla, pero el guard nunca lo encontraría. El
 * usuario tendría un permiso que no hace nada y ningún mensaje que lo explique.
 */
@ValidatorConstraint({ name: 'permisosDelCatalogo' })
class PermisosDelCatalogo implements ValidatorConstraintInterface {
  validate(valor: unknown) {
    return Array.isArray(valor) && valor.every((clave) => esPermisoConocido(String(clave)));
  }

  defaultMessage() {
    return 'Hay permisos que no existen en el sistema';
  }
}

export class CreateRoleDto {
  @IsString()
  @MinLength(3, { message: 'El nombre del rol es muy corto' })
  @MaxLength(60)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  descripcion?: string;

  @IsArray()
  @ArrayUnique()
  @Validate(PermisosDelCatalogo)
  permisos: string[];

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'El nombre del rol es muy corto' })
  @MaxLength(60)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  descripcion?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Validate(PermisosDelCatalogo)
  permisos?: string[];

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
