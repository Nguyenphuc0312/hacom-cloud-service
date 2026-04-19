export type Role = 'super_admin' | 'operator' | 'viewer' | 'hr_admin' | 'superadmin' | 'admin';

export interface CurrentAdmin {
  id: string;
  email: string;
  username?: string;
  status?: string;
  isVerified?: boolean;
  role?: Role;
  authoritySource?: 'db' | 'break_glass';
  permissions?: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user?: CurrentAdmin;
}

export type MeResponse = CurrentAdmin;
