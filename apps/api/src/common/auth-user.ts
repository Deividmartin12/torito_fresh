import { RoleName } from '@prisma/client';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: RoleName;
}
