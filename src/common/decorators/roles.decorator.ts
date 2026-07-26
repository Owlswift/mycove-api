import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<'RESIDENT' | 'GUARD' | 'ADMIN'>) =>
  SetMetadata(ROLES_KEY, roles);
