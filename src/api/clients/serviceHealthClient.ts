import { axiosInstance } from '@/api/axios';
import { adminApiPath } from '@/api/routes';
import { unwrapApiEnvelope } from '@/api/envelope';
import type { ServiceHealthResponse } from '@/api/types';

export const serviceHealthClient = {
  async getServiceHealth(): Promise<ServiceHealthResponse> {
    const response = await axiosInstance.get(adminApiPath('/service-health'));
    return unwrapApiEnvelope<ServiceHealthResponse>(response);
  },
};
