import type { Role } from './auth';

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface UsersListResponse {
  items: AdminUser[];
}

export interface CreateUserRequest {
  email: string;
  role: Role;
  password?: string;
}

export interface UpdateUserRoleRequest {
  role: Role;
}

export interface PasswordResetResponse {
  tempPassword: string;
}
