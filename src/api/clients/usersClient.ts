import { axiosInstance } from '@/api/axios';
import type {
  AdminUser,
  CreateUserRequest,
  PasswordResetResponse,
  UpdateUserRoleRequest,
  UsersListResponse,
} from '@/api/types';

export const usersClient = {
  async getUsers(): Promise<UsersListResponse> {
    const { data } = await axiosInstance.get<UsersListResponse>('/users');
    return data;
  },

  async createUser(payload: CreateUserRequest): Promise<AdminUser> {
    const { data } = await axiosInstance.post<AdminUser>('/users', payload);
    return data;
  },

  async updateRole(id: string, payload: UpdateUserRoleRequest): Promise<void> {
    await axiosInstance.put(`/users/${id}/role`, payload);
  },

  async resetPassword(id: string): Promise<PasswordResetResponse> {
    const { data } = await axiosInstance.put<PasswordResetResponse>(`/users/${id}/password-reset`);
    return data;
  },

  async deactivate(id: string): Promise<void> {
    await axiosInstance.delete(`/users/${id}`);
  },
};
