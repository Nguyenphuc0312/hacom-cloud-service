import { adminAxiosInstance } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type { ServiceHealthResponse } from '@/api/types/service-health/service-health';

export const serviceHealthClient = {
  async getServiceHealth(): Promise<ServiceHealthResponse> {
    const response = await adminAxiosInstance.get('/service-health');
    return unwrapApiEnvelope<ServiceHealthResponse>(response);
  },
};
