import type { Role } from '@/api/types';

type NormalizedRole = 'super_admin' | 'operator' | 'viewer' | 'hr_admin';

const ROLE_PRIORITY: Record<NormalizedRole, number> = {
  hr_admin: 2,
  operator: 2,
  viewer: 1,
  super_admin: 3,
};

const normalizeRole = (role: Role | undefined): NormalizedRole | undefined => {
  if (!role) return undefined;

  if (role === 'superadmin') return 'super_admin';
  if (role === 'admin') return 'operator';
  return role;
};

export const hasMinimumRole = (currentRole: Role | undefined, minimumRole: Role): boolean => {
  const normalizedRole = normalizeRole(currentRole);
  const normalizedMinimumRole = normalizeRole(minimumRole);
  if (!normalizedRole) return false;
  if (!normalizedMinimumRole) return false;
  return ROLE_PRIORITY[normalizedRole] >= ROLE_PRIORITY[normalizedMinimumRole];
};

export const hasSomeRole = (currentRole: Role | undefined, roles: Role[]): boolean => {
  const normalizedRole = normalizeRole(currentRole);
  if (!normalizedRole) return false;
  return roles.some((role) => normalizeRole(role) === normalizedRole);
};

export const canManageUsers = (currentRole: Role | undefined): boolean => {
  return hasSomeRole(currentRole, ['super_admin', 'operator']);
};

export const canManageHrEmployees = (currentRole: Role | undefined): boolean => {
  return hasSomeRole(currentRole, ['super_admin', 'operator', 'hr_admin']);
};

export const toDisplayRole = (currentRole: Role | undefined): string => {
  const normalizedRole = normalizeRole(currentRole);
  if (normalizedRole === 'super_admin') return 'Quản trị cấp cao';
  if (normalizedRole === 'operator') return 'Điều hành';
  if (normalizedRole === 'hr_admin') return 'Quản trị nhân sự';
  return 'Người xem';
};
