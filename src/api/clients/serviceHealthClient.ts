import { adminAxiosInstance } from '@/api/axios';
import { unwrapApiEnvelope } from '@/api/envelope';
import type { ServiceHealthResponse } from '@/api/types';

export const serviceHealthClient = {
  async getServiceHealth(): Promise<ServiceHealthResponse> {
    const response = await adminAxiosInstance.get('/service-health');
    return unwrapApiEnvelope<ServiceHealthResponse>(response);
  },
};
