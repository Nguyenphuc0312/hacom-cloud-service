import { adminAxiosInstance } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type { MonitoringOverviewResponse } from '@/api/types/monitoring/monitoring';
import type { TimeRange } from '@/api/types/metrics/metrics';

export const monitoringClient = {
  async getOverview(range: TimeRange): Promise<MonitoringOverviewResponse> {
    const response = await adminAxiosInstance.get('/monitoring/overview', {
      params: { range },
    });

    return unwrapApiEnvelope<MonitoringOverviewResponse>(response);
  },
};
