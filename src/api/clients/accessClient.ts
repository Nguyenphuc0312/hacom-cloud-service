import { adminAxiosInstance, authAxiosInstance } from '@/api/axios';
import { unwrapApiEnvelope } from '@/api/envelope';
import type {
  AccessRequestDetail,
  AccessRequestHistoryItem,
  AccessRequestListItem,
  AccessStatus,
  RequestCurrentIpAccessResponse,
} from '@/api/types';

export const accessClient = {
  async getCurrentStatus(): Promise<AccessStatus> {
    const response = await authAxiosInstance.get('/access/status');
    return unwrapApiEnvelope<AccessStatus>(response);
  },

  async requestCurrentIp(): Promise<RequestCurrentIpAccessResponse> {
    const response = await authAxiosInstance.post('/access/request-current-ip');
    return unwrapApiEnvelope<RequestCurrentIpAccessResponse>(response);
  },

  async listRequests(params: Record<string, string | number | undefined>): Promise<{
    items: AccessRequestListItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const response = await adminAxiosInstance.get('/access/ip-requests', { params });
    return unwrapApiEnvelope(response);
  },

  async getRequestDetail(id: string): Promise<AccessRequestDetail> {
    const response = await adminAxiosInstance.get(`/access/ip-requests/${id}`);
    return unwrapApiEnvelope(response);
  },

  async getRequestHistory(id: string): Promise<{ items: AccessRequestHistoryItem[] }> {
    const response = await adminAxiosInstance.get(`/access/ip-requests/${id}/history`);
    return unwrapApiEnvelope(response);
  },

  async approveRequest(id: string, payload: { reason?: string; note?: string; expiresAt?: string }) {
    const response = await adminAxiosInstance.post(`/access/ip-requests/${id}/approve`, payload);
    return unwrapApiEnvelope(response);
  },

  async rejectRequest(id: string, payload: { reason?: string; note?: string; expiresAt?: string }) {
    const response = await adminAxiosInstance.post(`/access/ip-requests/${id}/reject`, payload);
    return unwrapApiEnvelope(response);
  },

  async revokeRequest(id: string, payload: { reason?: string; note?: string; expiresAt?: string }) {
    const response = await adminAxiosInstance.post(`/access/ip-requests/${id}/revoke`, payload);
    return unwrapApiEnvelope(response);
  },
};
