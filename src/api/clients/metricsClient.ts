import { axiosInstance } from '@/api/axios';
import type { SloResponse, TimeseriesRequest, TimeseriesResponse } from '@/api/types';

export const metricsClient = {
  async getTimeseries(params: TimeseriesRequest): Promise<TimeseriesResponse> {
    const { data } = await axiosInstance.get<TimeseriesResponse>('/metrics/timeseries', {
      params: {
        query: params.query,
        range: params.range,
        step: params.step,
        service: params.service,
      },
    });

    return data;
  },

  async getSlo(range: string): Promise<SloResponse> {
    const { data } = await axiosInstance.get<SloResponse>('/metrics/slo', {
      params: { range },
    });
    return data;
  },
};
