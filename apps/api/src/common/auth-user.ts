import { RoleName } from '@prisma/client';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: RoleName;
  /**
   * Trabajador activo vinculado a la cuenta, o `null` si no tiene. Se resuelve en cada
   * petición junto con el rol, así vincular una cuenta tiene efecto sin volver a entrar.
   */
  trabajadorId: string | null;
  /**
   * Unidad de negocio del trabajador vinculado, o `null` si la cuenta no tiene ninguno.
   * Se resuelve en cada petición igual que el rol, así mover a alguien de unidad tiene
   * efecto sin volver a entrar. Al leer, `null` se trata como la unidad Principal.
   */
  unidadNegocioId: string | null;
}
