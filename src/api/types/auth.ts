export type Role = 'superadmin' | 'admin' | 'viewer';

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user?: CurrentUser;
}

export type MeResponse = CurrentUser;
