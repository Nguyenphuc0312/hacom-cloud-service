import { adminAxiosInstance } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type { AdminConfigStatusResponse } from '@/api/types/admin-config/admin-config';

export const adminConfigClient = {
  async getConfigStatus(): Promise<AdminConfigStatusResponse> {
    const response = await adminAxiosInstance.get('/config-status');
    return unwrapApiEnvelope<AdminConfigStatusResponse>(response);
  },
};
