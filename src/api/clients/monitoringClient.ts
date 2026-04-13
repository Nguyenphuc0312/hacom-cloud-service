import { axiosInstance } from '@/api/axios';
import { unwrapApiEnvelope } from '@/api/envelope';
import type { MonitoringOverviewResponse, TimeRange } from '@/api/types';

export const monitoringClient = {
  async getOverview(range: TimeRange): Promise<MonitoringOverviewResponse> {
    const response = await axiosInstance.get('/admin/monitoring/overview', {
      params: { range },
    });

    return unwrapApiEnvelope<MonitoringOverviewResponse>(response);
  },
};
