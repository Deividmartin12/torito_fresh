import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { RE_DOCUMENTO } from '../common/validacion';
import { EsCelular, EsEmailOpcional, EsNombrePersona } from '../common/validators';
import { CreateUserDto } from '../users/users.dto';

const CARGOS = ['Administrador', 'Almacenero', 'Vendedor', 'Repartidor'] as const;
const TIPOS_DOCUMENTO = ['DNI', 'CE', 'PAS'] as const;

export class CreateTrabajadorDto {
  @IsIn(TIPOS_DOCUMENTO, { message: 'Selecciona un tipo de documento válido' })
  tipoDocumento: string;

  @IsString()
  @Matches(RE_DOCUMENTO, {
    message: 'El documento debe tener entre 6 y 15 caracteres alfanuméricos',
  })
  numeroDocumento: string;

  @EsNombrePersona(100)
  nombres: string;

  @EsNombrePersona(100)
  apellidos: string;

  @EsCelular({ opcional: true })
  telefono?: string;

  @EsEmailOpcional(150)
  correo?: string;

  @IsIn(CARGOS, { message: 'Selecciona un cargo valido' })
  cargo: string;

  // Cuenta de acceso. `userId` vincula una que ya existe; `cuenta` crea una nueva. Sin
  // ninguna de las dos el trabajador queda sin acceso (y sin poder registrar operaciones).
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateUserDto)
  cuenta?: CreateUserDto;
}

export class UpdateTrabajadorDto {
  @IsOptional()
  @IsIn(TIPOS_DOCUMENTO, { message: 'Selecciona un tipo de documento válido' })
  tipoDocumento?: string;

  @IsOptional()
  @IsString()
  @Matches(RE_DOCUMENTO, {
    message: 'El documento debe tener entre 6 y 15 caracteres alfanuméricos',
  })
  numeroDocumento?: string;

  @IsOptional()
  @EsNombrePersona(100)
  nombres?: string;

  @IsOptional()
  @EsNombrePersona(100)
  apellidos?: string;

  @EsCelular({ opcional: true })
  telefono?: string;

  @EsEmailOpcional(150)
  correo?: string;

  @IsOptional()
  @IsIn(CARGOS, { message: 'Selecciona un cargo valido' })
  cargo?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  // Cadena vacía = desvincular la cuenta actual.
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateUserDto)
  cuenta?: CreateUserDto;
}
