import { axiosInstance } from '@/api/axios';
import type { OverviewResponse, ServicesResponse } from '@/api/types';

export const statusClient = {
  async getOverview(): Promise<OverviewResponse> {
    const { data } = await axiosInstance.get<OverviewResponse>('/status/overview');
    return data;
  },

  async getServices(status?: string): Promise<ServicesResponse> {
    const { data } = await axiosInstance.get<ServicesResponse>('/status/services', {
      params: status && status !== 'all' ? { status } : undefined,
    });
    return data;
  },
};
