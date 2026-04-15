import { authAxiosInstance, axiosInstance } from '@/api/axios';
import { adminApiPath } from '@/api/routes';
import { unwrapApiEnvelope } from '@/api/envelope';
import type { LoginRequest, LoginResponse, MeResponse } from '@/api/types';

export const authClient = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const response = await authAxiosInstance.post('/login', payload);
    return unwrapApiEnvelope<LoginResponse>(response);
  },

  async me(): Promise<MeResponse> {
    const response = await axiosInstance.get(adminApiPath('/me'));
    const payload = unwrapApiEnvelope<{ admin: MeResponse }>(response);
    return payload.admin;
  },
};
