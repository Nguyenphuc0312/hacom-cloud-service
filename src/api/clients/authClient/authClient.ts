import { adminAxiosInstance, authAxiosInstance } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type { LoginRequest, LoginResponse, MeResponse } from '@/api/types/auth/auth';

export const authClient = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const response = await authAxiosInstance.post('/login', payload);
    return unwrapApiEnvelope<LoginResponse>(response);
  },

  async me(): Promise<MeResponse> {
    const response = await adminAxiosInstance.get('/me');
    const payload = unwrapApiEnvelope<{ admin: MeResponse }>(response);
    return payload.admin;
  },
};
