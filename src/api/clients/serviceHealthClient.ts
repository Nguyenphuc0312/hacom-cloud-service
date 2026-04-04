import { axiosInstance } from '@/api/axios';
import { unwrapApiEnvelope } from '@/api/envelope';
import type { ServiceHealthResponse } from '@/api/types';

export const serviceHealthClient = {
  async getServiceHealth(): Promise<ServiceHealthResponse> {
    const response = await axiosInstance.get('/admin/service-health');
    return unwrapApiEnvelope<ServiceHealthResponse>(response);
  },
};
