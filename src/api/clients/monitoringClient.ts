import { axiosInstance } from '@/api/axios';
import { adminApiPath } from '@/api/routes';
import { unwrapApiEnvelope } from '@/api/envelope';
import type { MonitoringOverviewResponse, TimeRange } from '@/api/types';

export const monitoringClient = {
  async getOverview(range: TimeRange): Promise<MonitoringOverviewResponse> {
    const response = await axiosInstance.get(adminApiPath('/monitoring/overview'), {
      params: { range },
    });

    return unwrapApiEnvelope<MonitoringOverviewResponse>(response);
  },
};
