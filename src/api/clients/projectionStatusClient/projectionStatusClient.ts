import { adminAxiosInstance } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type { ProjectionStatusResponse } from '@/api/types/projection-status/projection-status';

export const projectionStatusClient = {
  async getProjectionStatus(): Promise<ProjectionStatusResponse> {
    const response = await adminAxiosInstance.get('/projection-status');
    return unwrapApiEnvelope<ProjectionStatusResponse>(response);
  },
};
