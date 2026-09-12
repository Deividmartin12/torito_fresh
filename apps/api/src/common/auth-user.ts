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
}
