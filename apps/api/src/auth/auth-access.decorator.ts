import { SetMetadata } from '@nestjs/common';

export const AUTH_ACCESS_KEY = 'auth_access';

export type AuthAccessLevel = 'approved' | 'super_admin';

export const RequireAuthAccess = (level: AuthAccessLevel) =>
  SetMetadata(AUTH_ACCESS_KEY, level);
