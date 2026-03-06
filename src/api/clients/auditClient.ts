import { axiosInstance } from '@/api/axios';
import type { AuditListResponse, AuditQuery } from '@/api/types';

export const auditClient = {
  async getAudit(params?: AuditQuery): Promise<AuditListResponse> {
    const { data } = await axiosInstance.get<AuditListResponse>('/audit', { params });
    return data;
  },
};
