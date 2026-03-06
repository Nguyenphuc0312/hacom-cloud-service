import type { Role } from '@/api/types';

const ROLE_PRIORITY: Record<Role, number> = {
  viewer: 1,
  admin: 2,
  superadmin: 3,
};

export const hasMinimumRole = (currentRole: Role | undefined, minimumRole: Role): boolean => {
  if (!currentRole) return false;
  return ROLE_PRIORITY[currentRole] >= ROLE_PRIORITY[minimumRole];
};

export const hasSomeRole = (currentRole: Role | undefined, roles: Role[]): boolean => {
  if (!currentRole) return false;
  return roles.includes(currentRole);
};
