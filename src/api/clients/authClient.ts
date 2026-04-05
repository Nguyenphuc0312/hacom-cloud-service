import { axiosInstance } from '@/api/axios';
import { unwrapApiEnvelope } from '@/api/envelope';
import type { LoginRequest, LoginResponse, MeResponse } from '@/api/types';

export const authClient = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const response = await axiosInstance.post('/auth/login', payload);
    return unwrapApiEnvelope<LoginResponse>(response);
  },

  async me(): Promise<MeResponse> {
    const response = await axiosInstance.get('/admin/me');
    const payload = unwrapApiEnvelope<{ admin: MeResponse }>(response);
    return payload.admin;
  },
};
