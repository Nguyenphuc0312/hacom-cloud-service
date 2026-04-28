import type { Role } from '@/api/types/auth/auth';

export const sourceTone: Record<string, 'default' | 'warning'> = {
  db: 'default',
  break_glass: 'warning',
};

export const formatSourceLabel = (value: string | null | undefined) => {
  if (!value) return '-';
  if (value === 'db') return 'DB';
  if (value === 'break_glass') return 'Break-glass';
  return value.replace(/_/g, ' ');
};

export const formatRoleLabel = (role: Role | null | undefined) => {
  if (!role) return 'Không có vai trò DB';
  if (role === 'super_admin') return 'Quản trị cấp cao';
  if (role === 'operator') return 'Điều hành';
  if (role === 'viewer') return 'Người xem';
  if (role === 'hr_admin') return 'Quản trị nhân sự';
  return role.replace(/_/g, ' ');
};

