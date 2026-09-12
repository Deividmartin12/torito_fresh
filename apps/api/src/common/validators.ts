/**
 * Decoradores de validación reutilizables, armados con `applyDecorators` sobre class-validator.
 * Evitan repetir la misma tira de `@IsString() @MaxLength() @Matches()` en cada DTO.
 */
import { applyDecorators } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import {
  MSG_CELULAR,
  MSG_DOCUMENTO,
  MSG_NOMBRE_LIBRE,
  MSG_NOMBRE_PERSONA,
  RE_CELULAR,
  RE_DOCUMENTO,
  RE_NOMBRE_LIBRE,
  RE_NOMBRE_PERSONA,
} from './validacion';

/** Nombre de persona: obligatorio, solo letras/espacios/apóstrofe/guion. */
export function EsNombrePersona(max = 100): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MaxLength(max),
    Matches(RE_NOMBRE_PERSONA, { message: MSG_NOMBRE_PERSONA }),
  );
}

/** Nombre de empresa/producto: obligatorio, letras + números + `. , & ( ) / - '`. */
export function EsNombreLibre(max = 150): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MaxLength(max),
    Matches(RE_NOMBRE_LIBRE, { message: MSG_NOMBRE_LIBRE }),
  );
}

/**
 * Celular de 9 dígitos que empieza en 9. Con `{ opcional: true }` solo valida cuando llega
 * algo distinto de cadena vacía / null (para campos de contacto que no son obligatorios).
 */
export function EsCelular(options: { opcional?: boolean } = {}): PropertyDecorator {
  const base = Matches(RE_CELULAR, { message: MSG_CELULAR });
  if (!options.opcional) return applyDecorators(IsString(), base);
  return applyDecorators(
    IsOptional(),
    ValidateIf((_object, value) => value !== '' && value != null),
    IsString(),
    base,
  );
}

/** Documento alfanumérico de 6 a 15 (cubre DNI 8, RUC 11, CE y pasaporte). */
export function EsDocumento(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MaxLength(20),
    Matches(RE_DOCUMENTO, { message: MSG_DOCUMENTO }),
  );
}

/** Correo opcional: valida el formato solo si llega algo. */
export function EsEmailOpcional(max = 150): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    ValidateIf((_object, value) => value !== '' && value != null),
    IsEmail({}, { message: 'El correo no tiene un formato válido' }),
    MaxLength(max),
  );
}
