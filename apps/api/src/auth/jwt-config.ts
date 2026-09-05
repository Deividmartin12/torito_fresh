import { ConfigService } from '@nestjs/config';

/**
 * Cuánto dura una sesión. Se define UNA sola vez acá: el token se firma con este plazo y
 * su vencimiento (`exp`) es la única verdad, tanto para el API como para la web.
 */
export const DURACION_SESION = '6h';

/**
 * Devuelve la clave con la que se firman los tokens. Si falta, corta el arranque en vez de
 * usar una clave por defecto: con una clave conocida cualquiera podría fabricarse un token
 * de administrador.
 */
export function obtenerClaveJwt(config: ConfigService): string {
  const clave = config.get<string>('JWT_SECRET');
  if (!clave || clave.trim().length < 16) {
    throw new Error(
      'Falta JWT_SECRET en el archivo .env (o es demasiado corta). ' +
        'Copia .env.example como .env y genera una clave larga, por ejemplo con: openssl rand -base64 48',
    );
  }
  return clave;
}
