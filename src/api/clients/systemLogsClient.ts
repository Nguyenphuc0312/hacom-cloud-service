import { adminAxiosInstance } from '@/api/axios';
import { unwrapApiEnvelope } from '@/api/envelope';
import type { SystemLogQuery, SystemLogsResponse } from '@/api/types';

export const systemLogsClient = {
  async list(params?: SystemLogQuery): Promise<SystemLogsResponse> {
    const response = await adminAxiosInstance.get('/system-logs', { params });
    const data = unwrapApiEnvelope<SystemLogsResponse>(response);

    return {
      items: Array.isArray(data.items) ? data.items : [],
    };
  },
};
