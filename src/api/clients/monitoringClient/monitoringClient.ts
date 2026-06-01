import { adminAxiosInstance } from '@/api/axios/axios';
import type { MonitoringOverviewResponse } from '@/api/types/monitoring/monitoring';
import type { TimeRange } from '@/api/types/metrics/metrics';

export interface MonitoringApiEnvelope {
  success: boolean;
  data?: MonitoringOverviewResponse;
  meta?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
  };
}

export const monitoringClient = {
  async getOverview(range: TimeRange): Promise<MonitoringOverviewResponse> {
    const response = await adminAxiosInstance.get<MonitoringApiEnvelope>('/monitoring/overview', {
      params: { range },
    });

    const payload = response.data;

    // Handle success case
    if (payload.success && payload.data) {
      return payload.data;
    }

    // Handle partial data case (success: false but data exists)
    if (payload.data) {
      return payload.data;
    }

    // No data available - throw error
    throw new Error(payload.error?.message ?? 'Monitoring data unavailable');
  },
};
