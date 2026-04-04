export type Role = 'superadmin' | 'admin' | 'viewer';

export interface CurrentAdmin {
  id: string;
  email: string;
  username?: string;
  status?: string;
  isVerified?: boolean;
  role?: Role;
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
