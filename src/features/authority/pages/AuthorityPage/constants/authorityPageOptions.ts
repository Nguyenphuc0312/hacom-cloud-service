import type { Role } from '@/api/types/auth/auth';

export const ROLE_OPTIONS: Array<{ label: string; value: Exclude<Role, 'superadmin' | 'admin'> }> = [
  { label: 'Quản trị cấp cao', value: 'super_admin' },
  { label: 'Điều hành', value: 'operator' },
  { label: 'Người xem', value: 'viewer' },
  { label: 'Quản trị nhân sự', value: 'hr_admin' },
];

export const PERMISSION_OPTIONS = [
  'admin.profile.read',
  'admin.authority.read',
  'admin.authority.write',
  'admin.users.read',
  'admin.users.write',
  'admin.users.deactivate',
  'admin.users.lock',
  'admin.users.unlock',
  'admin.users.revoke_sessions',
  'admin.sessions.read',
  'admin.hr.read',
  'admin.hr.write',
  'admin.hr.provision',
  'admin.hr.import',
  'admin.audit.read',
  'admin.access_ip.read',
  'admin.access_ip.review',
  'admin.access_ip.write',
  'admin.smtp.read',
  'admin.smtp.write',
  'admin.email_template.read',
  'admin.email_template.write',
  'admin.service_health.read',
];

