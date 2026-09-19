import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RE_DOCUMENTO, RE_USERNAME } from '../common/validacion';
import { EsCelular, EsEmailOpcional, EsNombrePersona } from '../common/validators';

const CARGOS = ['Administrador', 'Almacenero', 'Vendedor', 'Repartidor', 'Socio'] as const;
const TIPOS_DOCUMENTO = ['DNI', 'CE', 'PAS'] as const;

/**
 * Cuenta de acceso del trabajador, dentro del mismo alta.
 *
 * Solo trae lo propio del login. El nombre y el correo de la cuenta NO viajan acá: salen de
 * `nombres`/`apellidos`/`correo` del trabajador, para que no existan dos versiones del mismo
 * dato que se puedan ir separando con el tiempo. Lo mismo el `active` de la cuenta, que
 * sigue al `estado` del trabajador: dar de baja a alguien tiene que cerrarle el acceso.
 *
 * La contraseña es obligatoria cuando la cuenta se crea y opcional cuando se edita una que
 * ya existe (sin valor = se queda con la que tenía).
 */
export class CuentaTrabajadorDto {
  @IsString()
  @MinLength(2, { message: 'El nombre de usuario es muy corto' })
  @MaxLength(50)
  @Matches(RE_USERNAME, {
    message: 'El usuario solo puede tener letras, números, punto, guion y guion bajo',
  })
  username: string;

  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'La contraseña debe tener al menos 4 caracteres' })
  password?: string;

  // La clave del rol (`ADMIN`, `SELLER`, o la de uno creado desde el panel). No se valida
  // contra una lista fija porque los roles ahora son filas: que exista lo comprueba el
  // servicio al resolver su id, y así un rol nuevo funciona sin tocar este archivo.
  @IsString()
  @MaxLength(40)
  role: string;
}

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

  // Unidad de negocio a la que pertenece. Si no viene, el trabajador entra a la Principal:
  // es lo correcto para el alta de siempre, donde nadie piensa en unidades.
  @IsOptional()
  @IsString()
  unidadNegocioId?: string;

  // Cuenta de acceso. `userId` vincula una que ya existe; `cuenta` crea una nueva junto con
  // el trabajador, en la misma transacción. Sin ninguna de las dos el trabajador queda sin
  // acceso (y sin poder registrar operaciones).
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CuentaTrabajadorDto)
  cuenta?: CuentaTrabajadorDto;
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

  // Mover a alguien de unidad cambia dónde caen sus operaciones NUEVAS; las anteriores
  // conservan la unidad con la que se registraron, porque va estampada en cada fila.
  @IsOptional()
  @IsString()
  unidadNegocioId?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  // Cadena vacía = desvincular la cuenta actual.
  @IsOptional()
  @IsString()
  userId?: string;

  // Edita la cuenta que ya tiene el trabajador, o le crea una si todavía no tenía.
  @IsOptional()
  @ValidateNested()
  @Type(() => CuentaTrabajadorDto)
  cuenta?: CuentaTrabajadorDto;
}
