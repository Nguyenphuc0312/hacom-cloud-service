import { axiosInstance } from '@/api/axios';
import type {
  AckIncidentRequest,
  IncidentListResponse,
  SilenceIncidentRequest,
} from '@/api/types';

interface IncidentFilter {
  status?: string;
  severity?: string;
}

export const alertsClient = {
  async getIncidents(filters?: IncidentFilter): Promise<IncidentListResponse> {
    const { data } = await axiosInstance.get<IncidentListResponse>('/alerts/incidents', {
      params: filters,
    });
    return data;
  },

  async ackIncident(fingerprint: string, payload: AckIncidentRequest): Promise<void> {
    await axiosInstance.post(`/alerts/incidents/${fingerprint}/ack`, payload);
  },

  async silenceIncident(fingerprint: string, payload: SilenceIncidentRequest): Promise<void> {
    await axiosInstance.post(`/alerts/incidents/${fingerprint}/silence`, payload);
  },
};
